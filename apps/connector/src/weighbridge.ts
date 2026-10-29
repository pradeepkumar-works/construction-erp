import { createReadStream, type ReadStream } from 'fs';
import { connect, type Socket } from 'net';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { Reading } from './outbox';
import type { Connection } from './state';
import { readFrame, splitFrames, WeightWatch, type Weighing } from './weight';

/**
 * The weighbridge reader (item 148): keeps the indicator's serial port or network connection open between runs, reads
 * its frames as they come and hands each run the weighings since the last. The Connector still only calls out: the
 * network connection is to the indicator on the site's own network, and nothing listens on a port.
 */

interface Open {
  key: string;
  watch: WeightWatch;
  pending: Weighing[];
  close: () => void;
  /** Why it stopped, to say once on the next run; it opens again then */
  failed: string | null;
  lastFrameAt: number;
  quietSaid: boolean;
}

const open = new Map<string, Open>();
const QUIET_MS = 10 * 60_000;
const num = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

/** Sets a serial port's speed with the system's own tool (mode on Windows, stty elsewhere), 8 bits, no parity, 1 stop bit. */
function setUpSerial(port: string, baud: number): string {
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'mode', `${port}:`, `BAUD=${baud}`, 'PARITY=n', 'DATA=8', 'STOP=1'], { stdio: 'ignore' });
    return `\\\\.\\${port}`;
  }
  execFileSync('stty', [process.platform === 'darwin' ? '-f' : '-F', port, String(baud), 'cs8', '-cstopb', '-parenb', 'raw', '-echo'], { stdio: 'ignore' });
  return port;
}

function start(conn: Connection): Open {
  const c = conn.config;
  const key = JSON.stringify([c.source, c.port, c.baud, c.host, c.tcpPort, c.minKg, c.stableSeconds]);
  const o: Open = { key, watch: new WeightWatch(num(c.minKg, 200), num(c.stableSeconds, 3)), pending: [], close: () => {}, failed: null, lastFrameAt: Date.now(), quietSaid: false };
  let rest = '';
  const onData = (chunk: Buffer | string) => {
    const split = splitFrames(rest + chunk.toString('latin1'));
    rest = split.rest;
    for (const line of split.frames) {
      const f = readFrame(line);
      if (!f) continue;
      o.lastFrameAt = Date.now();
      o.quietSaid = false;
      const w = o.watch.feed(new Date(), f);
      if (w) o.pending.push(w);
    }
  };
  const fail = (e: Error | string) => {
    o.failed ??= typeof e === 'string' ? e : e.message;
  };
  if (c.source === 'TCP') {
    const socket: Socket = connect({ host: String(c.host), port: num(c.tcpPort, 0) });
    socket.setKeepAlive(true, 30_000);
    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('close', () => fail(`the connection to ${c.host}:${c.tcpPort} closed`));
    o.close = () => socket.destroy();
  } else {
    let stream: ReadStream | null = null;
    try {
      stream = createReadStream(setUpSerial(String(c.port), num(c.baud, 9600)), { highWaterMark: 256 });
      stream.on('data', onData);
      stream.on('error', fail);
      stream.on('close', () => fail(`${c.port} closed`));
    } catch (e) {
      fail(`${c.port} could not be set up (${(e as Error).message.split('\n')[0]}); check the port's name and that nothing else has it open`);
    }
    o.close = () => stream?.destroy();
  }
  return o;
}

/** What the weighbridge weighed since the last run; a stopped port or connection is said once and opened again. */
export async function readWeighbridge(conn: Connection): Promise<Reading[]> {
  let o = open.get(conn.id);
  const key = JSON.stringify([conn.config.source, conn.config.port, conn.config.baud, conn.config.host, conn.config.tcpPort, conn.config.minKg, conn.config.stableSeconds]);
  if (o && (o.key !== key || o.failed)) {
    o.close();
    open.delete(conn.id);
    const why = o.failed;
    const kept = o.pending;
    o = start(conn);
    o.pending.unshift(...kept);
    open.set(conn.id, o);
    if (why) throw new Error(`${why}; opening it again`);
  }
  if (!o) {
    o = start(conn);
    open.set(conn.id, o);
  }
  const device = conn.config.source === 'TCP' ? `${conn.config.host}:${conn.config.tcpPort}` : String(conn.config.port);
  const out = o.pending.splice(0).map(
    (w): Reading => ({ id: randomUUID(), connectionId: conn.id, at: w.at.toISOString(), payload: { at: w.at.toISOString(), weightKg: w.weightKg, stableSeconds: w.stableSeconds, deviceId: device } }),
  );
  if (!out.length && !o.quietSaid && Date.now() - o.lastFrameAt > QUIET_MS) {
    o.quietSaid = true;
    throw new Error(`nothing from the indicator on ${device} for 10 minutes; check its cable and that it sends continuously`);
  }
  return out;
}
