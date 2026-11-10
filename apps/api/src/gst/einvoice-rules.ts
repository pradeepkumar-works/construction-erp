import { createHash } from 'node:crypto';
import { GSTIN_PATTERN, gstDateTime, qrText, readGstDateTime, type EinvoicePayload, type GspConfig } from '@erp/shared';
import { feedUrlProblem } from '../telematics/telematics-rules';

/**
 * E-invoicing and e-way bills with no database (ARCHITECTURE "E-invoices and e-way bills"): the payload's hash that makes
 * a request once, the fake provider's stand-in numbers, a GSP connection's settings, and the readers of NIC's answers.
 * Tested in `src/scripts/einvoice-test.ts`.
 */

/** JSON with its keys in order at every level, so the same payload always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const payloadHash = (payload: unknown) => createHash('sha256').update(canonicalJson(payload)).digest('hex');

// ---------------------------------------------------------------------------------------------------------------------
// The fake provider's numbers

/** The financial year a dd/mm/yyyy date falls in, as 2026-27. */
export function financialYear(ddmmyyyy: string): string {
  const [, m, y] = ddmmyyyy.split('/').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The IRN as the IRP makes it: sha256 of the seller's GSTIN, the financial year, the document type and its number. */
export function irnOf(p: EinvoicePayload): string {
  return createHash('sha256').update(`${p.SellerDtls.Gstin}${financialYear(p.DocDtls.Dt)}${p.DocDtls.Typ}${p.DocDtls.No.toUpperCase()}`).digest('hex');
}

/** Digits from a hash: `n` of them, the first never 0. */
function digitsOf(hex: string, n: number): string {
  const d = (BigInt(`0x${hex.slice(0, 30)}`) % 10n ** BigInt(n - 1)).toString().padStart(n - 1, '0');
  return `${(Number.parseInt(hex.slice(30, 32), 16) % 9) + 1}${d}`;
}
/** A stand-in 15 digit acknowledgement number for an IRN. */
export const fakeAckNo = (irn: string) => digitsOf(irn, 15);
/** A stand-in 12 digit e-way bill number for a payload. */
export const fakeEwbNo = (hash: string) => digitsOf(hash, 12);

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
/** The fake's QR: shaped like the IRP's signed JWT, carrying the same claims, signed by nobody. */
export function fakeSignedQr(p: EinvoicePayload, irn: string, at: Date): string {
  return `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT', note: 'Stand-in from GST_PROVIDER=fake, not signed by NIC' }))}.${b64url(JSON.stringify({ data: qrText(p, irn, at), iss: 'NIC (stand-in)' }))}.`;
}

/** The claims inside a signed QR, read back (for the record and the test); null when it is not a QR token. */
export function readQrClaims(token: string): Record<string, unknown> | null {
  try {
    const body = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { data?: unknown };
    return typeof body.data === 'string' ? (JSON.parse(body.data) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// A GSP connection

/** A GST_GSP connection's settings, checked: https addresses on the internet, the GSTIN, the user and the client id. */
export function readGspConfig(raw: unknown, hasCredential: boolean): { config: GspConfig | null; problem: string | null } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim() : '');
  const url = str('url');
  const ewbUrl = str('ewbUrl');
  const gstin = str('gstin').toUpperCase();
  const userName = str('userName');
  const clientId = str('clientId');
  const urlProblem = feedUrlProblem(url, "GSP's e-invoice API") ?? (ewbUrl ? feedUrlProblem(ewbUrl, "GSP's e-way bill API") : null);
  if (urlProblem) return { config: null, problem: urlProblem };
  if (!GSTIN_PATTERN.test(gstin)) return { config: null, problem: 'Type the GSTIN the API user was made for, like 21AABCS1234F1Z5' };
  if (!userName) return { config: null, problem: 'Type the API user name made on the e-invoice portal for the GSP' };
  if (!clientId) return { config: null, problem: "Type the GSP's client id" };
  if (!hasCredential) return { config: null, problem: "Type the GSP's client secret and the API password, as client secret:password" };
  return { config: { url, ...(ewbUrl ? { ewbUrl } : {}), gstin, userName, clientId }, problem: null };
}

/** The sealed credential of a GSP connection: the client secret, then the API password after the first colon. */
export function readGspCredential(credential: string): { clientSecret: string; password: string } | null {
  const i = credential.indexOf(':');
  if (i <= 0 || i === credential.length - 1) return null;
  return { clientSecret: credential.slice(0, i), password: credential.slice(i + 1) };
}

// ---------------------------------------------------------------------------------------------------------------------
// NIC's answers

export type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

export interface IrnValue {
  irn: string;
  ackNo: string;
  ackAt: Date;
  signedQr: string | null;
  /** The IRP already had this invoice and named its IRN (error 2150): taken as made */
  duplicate: boolean;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** NIC's `Data` comes as an object, or as a JSON string inside the answer. */
function dataOf(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      return obj(JSON.parse(v));
    } catch {
      return null;
    }
  }
  return obj(v);
}
const text = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** The IRP's error list in words: "2150: Duplicate IRN; 2172: ..." */
function irpErrors(a: Record<string, unknown>): string {
  const list = Array.isArray(a.ErrorDetails) ? a.ErrorDetails : [];
  const words = list.map((e) => obj(e)).filter(Boolean).map((e) => `${text(e!.ErrorCode) ?? ''}: ${text(e!.ErrorMessage) ?? ''}`.trim());
  return words.join('; ') || text(a.message) || 'The IRP refused it without saying why';
}

/** NIC's answer to Generate IRN. Error 2150 (Duplicate IRN) is success: its InfoDtls name the IRN made before. */
export function readIrnAnswer(raw: unknown): Answer<IrnValue> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The IRP sent back something that is not JSON' };
  const d = String(a.Status) === '1' ? dataOf(a.Data) : null;
  if (d && d.Irn) {
    const ackAt = readGstDateTime(text(d.AckDt));
    if (!ackAt) return { ok: false, error: `The IRP's acknowledgement date ${text(d.AckDt)} could not be read` };
    return { ok: true, value: { irn: String(d.Irn), ackNo: String(d.AckNo), ackAt, signedQr: text(d.SignedQRCode), duplicate: false } };
  }
  const errors = Array.isArray(a.ErrorDetails) ? a.ErrorDetails.map(obj) : [];
  if (errors.some((e) => text(e?.ErrorCode) === '2150')) {
    const info = (Array.isArray(a.InfoDtls) ? a.InfoDtls.map(obj) : []).find((i) => text(i?.InfCd) === 'DUPIRN');
    const desc = dataOf(info?.Desc);
    const ackAt = readGstDateTime(text(desc?.AckDt));
    if (desc?.Irn && ackAt) return { ok: true, value: { irn: String(desc.Irn), ackNo: String(desc.AckNo), ackAt, signedQr: null, duplicate: true } };
  }
  return { ok: false, error: irpErrors(a) };
}

/** NIC's answer to Get IRN details: the signed QR of an IRN made before. */
export function readIrnDetails(raw: unknown): string | null {
  const a = obj(raw);
  const d = a && String(a.Status) === '1' ? dataOf(a.Data) : null;
  return text(d?.SignedQRCode);
}

/** NIC's answer to Cancel IRN: when it was cancelled. */
export function readIrnCancel(raw: unknown): Answer<{ cancelledAt: Date }> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The IRP sent back something that is not JSON' };
  const d = String(a.Status) === '1' ? dataOf(a.Data) : null;
  const at = readGstDateTime(text(d?.CancelDate));
  return d && at ? { ok: true, value: { cancelledAt: at } } : { ok: false, error: irpErrors(a) };
}

/** The e-way bill system's error in words: its codes, or its message. */
function ewbError(a: Record<string, unknown>): string {
  const e = dataOf(a.error) ?? obj(a.error);
  return text(e?.message) ?? (e?.errorCodes ? `Error codes ${text(e.errorCodes)}` : null) ?? text(a.message) ?? 'The e-way bill system refused it without saying why';
}
const ewbData = (a: Record<string, unknown>) => (String(a.status ?? a.Status) === '1' ? dataOf(a.data ?? a.Data) : null);

/** The e-way bill system's answer to Generate: the number, when it was made and until when it is good. */
export function readEwbAnswer(raw: unknown): Answer<{ ewbNo: string; madeAt: Date; validUntil: Date }> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The e-way bill system sent back something that is not JSON' };
  const d = ewbData(a);
  const madeAt = readGstDateTime(text(d?.ewayBillDate));
  const validUntil = readGstDateTime(text(d?.validUpto));
  return d?.ewayBillNo && madeAt && validUntil ? { ok: true, value: { ewbNo: String(d.ewayBillNo), madeAt, validUntil } } : { ok: false, error: ewbError(a) };
}

/** The e-way bill system's answer to Extend validity: until when it is good now. */
export function readEwbExtend(raw: unknown): Answer<{ validUntil: Date }> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The e-way bill system sent back something that is not JSON' };
  const validUntil = readGstDateTime(text(ewbData(a)?.validUpto));
  return validUntil ? { ok: true, value: { validUntil } } : { ok: false, error: ewbError(a) };
}

/** The e-way bill system's answer to Cancel: when it was cancelled. */
export function readEwbCancel(raw: unknown): Answer<{ cancelledAt: Date }> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The e-way bill system sent back something that is not JSON' };
  const at = readGstDateTime(text(ewbData(a)?.cancelDate));
  return at ? { ok: true, value: { cancelledAt: at } } : { ok: false, error: ewbError(a) };
}

/** The time the e-way bill system writes back, from an instant (dd/mm/yyyy hh:mm:ss AM). */
export function ewbDateTime(d: Date): string {
  const [ymd, hms] = gstDateTime(d).split(' ');
  const [h, m, s] = hms.split(':').map(Number);
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)} ${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The systems answer to the second: an instant as they would write it back. */
export const gstAnswerTime = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);
