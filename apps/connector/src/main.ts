#!/usr/bin/env node
/**
 * Nirmaan Connector (ARCHITECTURE "Integration layer"). Runs on a computer at a site or office, reads the
 * devices on its network and sends their readings to Nirmaan. It only calls out (HTTPS to the API); nothing on the
 * site's router is opened, and it never listens on a port.
 *
 *   node dist/main.js pair <api-url> <code>   once, with the code from Admin, Connections, Connectors
 *   node dist/main.js run                     keeps running: settings every minute, read, send
 *   node dist/main.js status                  what it is paired to and how many readings wait
 */
import { hostname } from 'os';
import { fetchSettings, NotPairedError, pair, sendReadings, VERSION } from './client';
import { Outbox } from './outbox';
import { READERS } from './readers';
import { homeDir, log, outboxFile, pairingFile, readPairing, readSettings, settingsFile, writeJsonSafe, type Settings } from './state';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doPair(api: string | undefined, code: string | undefined) {
  if (!api || !code) {
    console.error('Usage: node dist/main.js pair <api-url> <code>\nThe API address and the code are on the pairing screen in Admin, Connections, Connectors.');
    process.exit(2);
  }
  try {
    const r = await pair(api, code, hostname());
    writeJsonSafe(pairingFile(), { api: api.replace(/\/+$/, ''), token: r.token, agentId: r.agentId, name: r.name, pairedAt: new Date().toISOString() });
    log(`Paired as ${r.name}. Start it with: node dist/main.js run (or install.ps1 on Windows)`);
  } catch (e) {
    console.error(`Could not pair: ${(e as Error).message}`);
    process.exit(1);
  }
}

function status() {
  const p = readPairing();
  const s = readSettings();
  console.log(`Nirmaan Connector ${VERSION}, files in ${homeDir()}`);
  console.log(p ? `Paired as ${p.name} with ${p.api} on ${p.pairedAt}` : 'Not paired yet');
  if (s) console.log(`Reads: ${s.connections.map((c) => `${c.name} (${c.kind})`).join(', ') || 'nothing yet'}`);
  console.log(`Readings waiting to be sent: ${new Outbox(outboxFile()).size()}`);
}

/** Send what waits, a batch at a time; a batch the server answered for leaves the outbox, whatever it made of it. */
async function flush(api: string, token: string, outbox: Outbox, batchMax: number) {
  for (;;) {
    const batch = outbox.all().slice(0, batchMax);
    if (!batch.length) return;
    const r = await sendReadings(api, token, batch);
    outbox.remove(batch);
    if (r.failed) log(`Sent ${batch.length}: ${r.accepted} taken in, ${r.duplicates} already there, ${r.failed} refused: ${r.problems.slice(0, 3).join('; ')}`);
    if (batch.length < batchMax) return;
  }
}

async function run() {
  log(`Nirmaan Connector ${VERSION} starting on ${hostname()}`);
  const outbox = new Outbox(outboxFile());
  const unknownKinds = new Set<string>();
  let backoff = 0;
  for (;;) {
    const p = readPairing();
    if (!p) {
      log('Not paired. Run: node dist/main.js pair <api-url> <code>');
      await sleep(5 * 60_000);
      continue;
    }
    let settings: Settings | null = readSettings();
    let online = true;
    try {
      settings = await fetchSettings(p.api, p.token);
      writeJsonSafe(settingsFile(), settings);
    } catch (e) {
      if (e instanceof NotPairedError) {
        log(`The server no longer knows this Connector (${e.message}). Pair it again with a new code.`);
        await sleep(5 * 60_000);
        continue;
      }
      online = false;
      log(`Cannot reach ${p.api} (${(e as Error).message}); reading on with the last settings and keeping the readings`);
    }
    const waiting = outbox.size();
    for (const conn of settings?.connections ?? []) {
      const reader = READERS[conn.kind];
      if (!reader) {
        if (!unknownKinds.has(conn.kind)) log(`${conn.name}: this version cannot read ${conn.kind}; update the Connector`);
        unknownKinds.add(conn.kind);
        continue;
      }
      try {
        const dropped = outbox.add(await reader(conn, { waiting }));
        if (dropped) log(`The outbox was full: the ${dropped} oldest readings were dropped`);
      } catch (e) {
        log(`${conn.name}: could not read (${(e as Error).message})`);
      }
    }
    if (online) {
      try {
        await flush(p.api, p.token, outbox, settings?.batchMax ?? 500);
        backoff = 0;
      } catch (e) {
        online = false;
        log(`Sending failed (${(e as Error).message}); trying again later`);
      }
    }
    backoff = online ? 0 : Math.min(backoff + 1, 5);
    await sleep((settings?.pollSeconds ?? 60) * 1000 * (online ? 1 : 1 + backoff));
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'pair') void doPair(args[0], args[1]);
else if (cmd === 'run') void run();
else if (cmd === 'status') status();
else if (cmd === 'version' || cmd === '--version') console.log(VERSION);
else {
  console.log('Nirmaan Connector\n\n  pair <api-url> <code>   pair with the code from Admin, Connections, Connectors\n  run                     keep reading and sending\n  status                  what it is paired to and what waits');
  process.exit(cmd ? 2 : 0);
}
