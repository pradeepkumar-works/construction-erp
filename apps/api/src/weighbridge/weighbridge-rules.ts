/**
 * Weighbridge rules (item 148, ARCHITECTURE "Weighbridge"): what a Connector's weighing says, a weighbridge
 * connection's settings, and the tickets' numbers. Pure: tested in `src/scripts/weighbridge-test.ts`. The net weight,
 * short supply and the GRN check are in `@erp/shared/weighbridge.ts`.
 */
import { WEIGH_BAUDS, WEIGH_MAX_KG, WEIGH_MIN_KG, WEIGH_STABLE_SECONDS, WEIGHBRIDGE_SOURCES, type WeighbridgeConfig, type WeighbridgeSource } from '@erp/shared';

/** A weighing older than this is not taken in: the Connector sends within minutes, or within a day after an outage. */
export const WEIGHING_MAX_AGE_MS = 7 * 86_400_000;
const MAX_AHEAD_MS = 5 * 60_000;

export interface WeighingIn {
  at: Date;
  weightKg: number;
  stableSeconds: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One weight from the Connector's weighbridge reader: `{ at, weightKg, stableSeconds }`. */
export function readWeighing(payload: unknown, receivedAt: Date): { weighing: WeighingIn; problem?: undefined } | { weighing?: undefined; problem: string } {
  if (!isObj(payload)) return { problem: 'The reading is not a JSON object' };
  const kg = num(payload.weightKg);
  if (kg === null) return { problem: 'No weightKg in the reading; update the Connector' };
  if (kg < WEIGH_MIN_KG) return { problem: `${kg} kg is an empty bridge, not a truck` };
  if (kg > WEIGH_MAX_KG) return { problem: `${kg} kg is more than a weighbridge weighs; check the indicator's output` };
  const at = typeof payload.at === 'string' ? new Date(payload.at) : null;
  if (!at || Number.isNaN(at.getTime())) return { problem: 'The reading has no time' };
  if (receivedAt.getTime() - at.getTime() > WEIGHING_MAX_AGE_MS) return { problem: `The weight is from ${at.toISOString().slice(0, 10)}, more than 7 days ago; type it on the ticket instead` };
  if (at.getTime() - receivedAt.getTime() > MAX_AHEAD_MS) return { problem: "The weight's time is ahead of the clock; check the site computer's clock" };
  const held = num(payload.stableSeconds);
  return { weighing: { at, weightKg: Math.round(kg * 1000) / 1000, stableSeconds: held !== null && held >= 0 ? Math.round(held) : null } };
}

const SERIAL_PORT = /^(COM\d{1,3}|\/dev\/[A-Za-z0-9._/-]{1,60})$/i;
const HOST = /^(?=.{1,253}$)([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** A weighbridge connection's settings, checked and trimmed before they are saved. */
export function readWeighbridgeConfig(raw: unknown): { config: WeighbridgeConfig; problem?: undefined } | { config?: undefined; problem: string } {
  const c = isObj(raw) ? raw : {};
  const source = c.source as WeighbridgeSource;
  if (!WEIGHBRIDGE_SOURCES.includes(source)) return { problem: "Choose how the Connector reads the indicator: its serial port or its network address" };
  const minKg = c.minKg === undefined || c.minKg === null ? WEIGH_MIN_KG : num(c.minKg);
  if (minKg === null || minKg < 20 || minKg > 20_000) return { problem: 'The weight a truck counts from must be between 20 and 20,000 kg' };
  const stableSeconds = c.stableSeconds === undefined || c.stableSeconds === null ? WEIGH_STABLE_SECONDS : num(c.stableSeconds);
  if (stableSeconds === null || stableSeconds < 1 || stableSeconds > 30) return { problem: 'The seconds a weight must hold must be between 1 and 30' };
  if (source === 'SERIAL') {
    const port = typeof c.port === 'string' ? c.port.trim() : '';
    if (!SERIAL_PORT.test(port)) return { problem: 'Type the serial port as Windows shows it (COM3) or Linux does (/dev/ttyUSB0)' };
    const baud = c.baud === undefined || c.baud === null ? 9600 : num(c.baud);
    if (!WEIGH_BAUDS.includes(baud as (typeof WEIGH_BAUDS)[number])) return { problem: `Choose the indicator's baud rate: ${WEIGH_BAUDS.join(', ')}` };
    return { config: { source, port: port.toUpperCase().startsWith('COM') ? port.toUpperCase() : port, baud: baud!, minKg, stableSeconds } };
  }
  const host = typeof c.host === 'string' ? c.host.trim() : '';
  if (!HOST.test(host)) return { problem: "Type the indicator's address on the site's network, such as 192.168.1.50" };
  const tcpPort = num(c.tcpPort);
  if (tcpPort === null || !Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65_535) return { problem: 'Type the port the indicator sends on, such as 4001' };
  return { config: { source, host, tcpPort, minKg, stableSeconds } };
}

/** The ticket number after the year's last: WB-2026-0007. */
export function nextTicketNo(last: string | null, year: number): string {
  const prefix = `WB-${year}-`;
  const n = last?.startsWith(prefix) ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`;
}

