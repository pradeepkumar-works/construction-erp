import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { AgentState, ConnectionHealth } from '@erp/shared';

/**
 * The integration layer's rules (ARCHITECTURE "Integration layer"), with no database: secrets and their
 * hashes, pairing codes, saved keys under INTEGRATION_KEY, a connection's health and a Connector's state, what a
 * batch of readings may hold, and what a generic message says. Tested in `src/scripts/integrations-test.ts`.
 */

/** A web address secret or a Connector token: 32 random bytes, URL-safe. */
export const newSecret = (prefix = '') => prefix + randomBytes(32).toString('base64url');

/** Secrets, tokens and codes are kept only as their sha256. */
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

export const last4 = (secret: string) => secret.slice(-4);

/** No 0/O, 1/I/L, so a code read off a screen and typed on a site computer comes out right. */
export const PAIR_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PAIR_CODE_MINUTES = 30;

/** An 8-character pairing code, shown as XXXX-XXXX. */
export function pairCode(bytes: Buffer = randomBytes(8)): string {
  const chars = [...bytes.subarray(0, 8)].map((b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** A code as typed: lower case, spaces or no dash all read the same. Null when it cannot be a code. */
export function normalisePairCode(typed: string): string | null {
  const s = typed.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 8 || [...s].some((c) => !PAIR_ALPHABET.includes(c))) return null;
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export const pairCodeExpiry = (now: Date) => new Date(now.getTime() + PAIR_CODE_MINUTES * 60_000);

/** A Connector's token is `nct_` and a secret; anything else is not worth a database look-up. */
export const TOKEN_PREFIX = 'nct_';
export const looksLikeToken = (t: string | undefined | null): t is string => !!t && t.startsWith(TOKEN_PREFIX) && t.length > 40 && t.length < 100;

export function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

/**
 * A key or password for an outside system, sealed with AES-256-GCM under INTEGRATION_KEY (any passphrase; its sha256
 * is the key). Stored as v1:iv:tag:data in base64url. With no INTEGRATION_KEY nothing can be saved.
 */
function keyOf(passphrase: string) {
  return createHash('sha256').update(passphrase).digest();
}

export function sealSecret(plain: string, passphrase: string, iv: Buffer = randomBytes(12)): string {
  const cipher = createCipheriv('aes-256-gcm', keyOf(passphrase), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

/** The saved secret, or null when it was sealed under another key or has been changed. */
export function openSecret(sealed: string, passphrase: string): string | null {
  const [v, iv, tag, data] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(passphrase), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface HealthFacts {
  isActive: boolean;
  lastEventAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  quietAfterMin: number;
}

/** Off, waiting for its first message, failing (the last thing it did failed), quiet (nothing for a while) or working. */
export function connectionHealth(c: HealthFacts, now: Date): ConnectionHealth {
  if (!c.isActive) return 'OFF';
  if (!c.lastEventAt) return 'NOT_SET_UP';
  if (c.lastErrorAt && (!c.lastSuccessAt || c.lastErrorAt > c.lastSuccessAt)) return 'FAILING';
  if (now.getTime() - c.lastEventAt.getTime() > c.quietAfterMin * 60_000) return 'QUIET';
  return 'LIVE';
}

/** A Connector asks for its settings every minute; three missed and it shows offline. */
export const AGENT_OFFLINE_MIN = 3;

export interface AgentFacts {
  revokedAt: Date | null;
  pairedAt: Date | null;
  pairCodeExpiresAt: Date | null;
  lastSeenAt: Date | null;
}

export function agentState(a: AgentFacts, now: Date): AgentState {
  if (a.revokedAt) return 'REVOKED';
  if (!a.pairedAt) return a.pairCodeExpiresAt && a.pairCodeExpiresAt > now ? 'WAITING_TO_PAIR' : 'CODE_EXPIRED';
  if (a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() <= AGENT_OFFLINE_MIN * 60_000) return 'ONLINE';
  return 'OFFLINE';
}

export interface RawReading {
  id?: unknown;
  connectionId?: unknown;
  at?: unknown;
  payload?: unknown;
}

export interface Reading {
  id: string;
  connectionId: string;
  at: Date;
  payload: Record<string, unknown>;
}

/** A reading may be up to a week old (the Connector keeps them while the internet is down) and not ahead of the server by more than five minutes. */
export const READING_MAX_AGE_DAYS = 7;

/** Readings that can be taken in, and a line for each that cannot (numbered from 1, as the Connector's log shows them). */
export function readBatch(raw: RawReading[], now: Date): { readings: Reading[]; problems: string[] } {
  const readings: Reading[] = [];
  const problems: string[] = [];
  raw.forEach((r, i) => {
    const n = `Reading ${i + 1}`;
    if (typeof r.id !== 'string' || !r.id.trim() || r.id.length > 100) return problems.push(`${n}: send an id of up to 100 characters`);
    if (typeof r.connectionId !== 'string' || !r.connectionId) return problems.push(`${n}: say which connection it is for`);
    const at = typeof r.at === 'string' ? new Date(r.at) : null;
    if (!at || Number.isNaN(at.getTime())) return problems.push(`${n}: send its time as an ISO date, e.g. 2026-10-29T09:30:00+05:30`);
    if (at.getTime() > now.getTime() + 5 * 60_000) return problems.push(`${n}: its time is ahead of the server; set the computer's clock`);
    if (now.getTime() - at.getTime() > READING_MAX_AGE_DAYS * 86_400_000) return problems.push(`${n}: older than ${READING_MAX_AGE_DAYS} days, so it is not taken in`);
    if (!r.payload || typeof r.payload !== 'object' || Array.isArray(r.payload)) return problems.push(`${n}: its payload must be a JSON object`);
    readings.push({ id: r.id.trim(), connectionId: r.connectionId, at, payload: r.payload as Record<string, unknown> });
  });
  return { readings, problems };
}

export interface GenericMessage {
  /** The sender's id for the message, so a repeat is counted once */
  externalId: string | null;
  /** The device it is about, if it names one */
  deviceId: string | null;
  deviceLabel: string | null;
  summary: string;
}

const text = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) || null : null);

/** A JSON message from any service: its id, the device it names (deviceId, device_id, imei or serial) and a line for the log. */
export function readGeneric(body: unknown, headerId?: string | null): GenericMessage {
  const o = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const externalId = text(headerId, 100) ?? text(o.id, 100) ?? text(o.eventId, 100) ?? text(o.event_id, 100);
  const deviceId = text(o.deviceId, 100) ?? text(o.device_id, 100) ?? text(o.imei, 100) ?? text(o.serial, 100);
  const deviceLabel = text(o.deviceName, 120) ?? text(o.device_name, 120) ?? text(o.label, 120);
  const keys = Object.keys(o);
  const summary = !keys.length
    ? 'An empty message'
    : `${deviceId ? `From ${deviceLabel ?? deviceId}: ` : ''}${keys.length} field${keys.length === 1 ? '' : 's'} (${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '…' : ''})`;
  return { externalId, deviceId, deviceLabel, summary };
}

/** What the log keeps of a message: the JSON as sent, cut to about 4 KB so a large upload does not fill the database. */
export const DETAIL_MAX_CHARS = 4000;
export function logDetail(body: unknown): unknown {
  if (body === undefined || body === null) return null;
  const s = JSON.stringify(body);
  if (s.length <= DETAIL_MAX_CHARS) return body;
  return { cut: true, length: s.length, start: s.slice(0, DETAIL_MAX_CHARS) };
}
