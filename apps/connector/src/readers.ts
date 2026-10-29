import { hostname, uptime } from 'os';
import { randomUUID } from 'crypto';
import type { Reading } from './outbox';
import type { Connection } from './state';
import { VERSION } from './client';
import { readWeighbridge } from './weighbridge';

export interface ReaderContext {
  waiting: number;
}

/**
 * A kind's reader: what it read from its device since the last time, as readings. The kinds that read site devices
 * (a weighbridge's serial port, a batching plant's export folder) add theirs here; the server reads each payload.
 */
export type Reader = (conn: Connection, ctx: ReaderContext) => Promise<Reading[]>;

const reading = (conn: Connection, payload: Record<string, unknown>): Reading => ({ id: randomUUID(), connectionId: conn.id, at: new Date().toISOString(), payload });

export const READERS: Record<string, Reader> = {
  /** One reading a run, so the log shows the Connector working before any device is set up. */
  CONNECTOR_CHECK: async (conn, ctx) => [reading(conn, { deviceId: hostname(), deviceName: hostname(), version: VERSION, uptimeMin: Math.round(uptime() / 60), waiting: ctx.waiting })],
  /** Each weight the weighbridge's indicator held steady (item 148), read from its serial port or network address. */
  WEIGHBRIDGE: (conn) => readWeighbridge(conn),
};
