import { createHash } from 'node:crypto';
import { GSTIN_PATTERN, gstDateTime, gstPaise, qrText, readGstDateTime, type EinvoicePayload, type GspConfig } from '@erp/shared';
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
  if (!hasCredential) return { config: null, problem: "Type the GSP's client secret and the API password" };
  return { config: { url, ...(ewbUrl ? { ewbUrl } : {}), gstin, userName, clientId }, problem: null };
}

/**
 * A GSP connection's credential, as the form sends it and the connection seals it: JSON of the client secret and the API
 * password, so either may hold any character (a colon too). Null when it is not that.
 */
export function readGspCredential(credential: string): { clientSecret: string; password: string } | null {
  try {
    const o = JSON.parse(credential) as { clientSecret?: unknown; password?: unknown };
    const clientSecret = typeof o?.clientSecret === 'string' ? o.clientSecret : '';
    const password = typeof o?.password === 'string' ? o.password : '';
    return clientSecret.trim() && password ? { clientSecret, password } : null;
  } catch {
    return null;
  }
}

/** The credential to seal for a client secret and API password. */
export const gspCredential = (clientSecret: string, password: string) => JSON.stringify({ clientSecret, password });

// ---------------------------------------------------------------------------------------------------------------------
// NIC's answers

/**
 * What a provider's answer came to: made, refused (`error`), or no answer at all (`unanswered`: the call timed out, the
 * connection broke, or the GSP answered 5xx or not in JSON), when the document may or may not have been made there.
 */
export type Answer<T> = { ok: true; value: T } | { ok: false; error: string; unanswered?: boolean };

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

/** An invoice's own figures, as the IRP holds them under an IRN: number, date, assessable and total value. */
export interface IrnFigures {
  no: string;
  dt: string;
  assVal: number;
  totInvVal: number;
}

/** The figures of an invoice JSON (INV-01): its DocDtls and ValDtls; null when they are not there. */
function figuresOf(inv: Record<string, unknown> | null): IrnFigures | null {
  const doc = obj(inv?.DocDtls);
  const val = obj(inv?.ValDtls);
  if (!doc || !val || doc.No === undefined || doc.Dt === undefined || val.AssVal === undefined || val.TotInvVal === undefined) return null;
  return { no: String(doc.No), dt: String(doc.Dt), assVal: Number(val.AssVal), totInvVal: Number(val.TotInvVal) };
}

/**
 * NIC's answer to Get IRN details: the signed QR of an IRN made before, and the figures it was made for (read from the
 * answer's DocDtls and ValDtls, or from inside the signed invoice, whose JWT carries the invoice JSON as its `data`).
 */
export function readIrnDetails(raw: unknown): { signedQr: string | null; figures: IrnFigures | null } {
  const a = obj(raw);
  const d = a && String(a.Status) === '1' ? dataOf(a.Data) : null;
  let figures = figuresOf(d);
  const signed = text(d?.SignedInvoice);
  if (!figures && signed) {
    try {
      const body = obj(JSON.parse(Buffer.from(signed.split('.')[1] ?? '', 'base64url').toString('utf8')));
      figures = figuresOf(dataOf(body?.data));
    } catch {
      figures = null;
    }
  }
  return { signedQr: text(d?.SignedQRCode), figures };
}

/**
 * Error 2150 says the IRP already holds an IRN for this invoice number. It is ours only when the IRP holds it for the same
 * figures: the same number and date, assessable and total value (to the paisa). Otherwise the words to show; the IRN is
 * not taken as this bill's.
 */
export function duplicateIrnProblem(payload: EinvoicePayload, irn: string, held: IrnFigures | null): string | null {
  const paise = (v: number) => gstPaise(v) ?? Number.NaN;
  const same =
    !!held &&
    held.no.toUpperCase() === payload.DocDtls.No.toUpperCase() &&
    held.dt === payload.DocDtls.Dt &&
    paise(held.assVal) === paise(payload.ValDtls.AssVal) &&
    paise(held.totInvVal) === paise(payload.ValDtls.TotInvVal);
  if (same) return null;
  return held
    ? `The IRP holds IRN ${irn} for other figures: cancel it there within 24 hours or raise a credit note`
    : `The IRP holds IRN ${irn} for ${payload.DocDtls.No}, and its figures could not be read to match them with this bill: check it on the e-invoice portal`;
}

/** NIC's error codes in an answer: the IRP's ErrorDetails, or the e-way bill system's errorCodes (often a quoted string). */
export function gstErrorCodes(raw: unknown): string[] {
  const a = obj(raw);
  if (!a) return [];
  const irp = Array.isArray(a.ErrorDetails) ? a.ErrorDetails.map((e) => text(obj(e)?.ErrorCode)).filter((c): c is string => !!c) : [];
  const e = a.error;
  const ewb = /errorCodes['"]?\s*:\s*['"]?([0-9 ,]+)/.exec(typeof e === 'string' ? e : JSON.stringify(e ?? ''))?.[1] ?? '';
  return [...irp, ...ewb.split(',').map((c) => c.trim()).filter(Boolean)];
}

/** IRP 1005: the auth token is not valid (any more); sign in again. */
export const IRP_INVALID_TOKEN = '1005';
/** E-way bill 604: an e-way bill was already made on this document number. */
export const EWB_ALREADY_MADE = '604';

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

/**
 * The e-way bill system's answer to Get e-way bill by document (GetEwayBillGeneratedByConsigner): the one made on this
 * challan, or null when there is none.
 */
export function readEwbByDoc(raw: unknown): Answer<{ ewbNo: string; madeAt: Date; validUntil: Date } | null> {
  const a = obj(raw);
  if (!a) return { ok: false, error: 'The e-way bill system sent back something that is not JSON' };
  const d = ewbData(a);
  if (!d) return { ok: true, value: null };
  const madeAt = readGstDateTime(text(d.ewayBillDate));
  const validUntil = readGstDateTime(text(d.validUpto));
  return d.ewayBillNo && madeAt && validUntil ? { ok: true, value: { ewbNo: String(d.ewayBillNo), madeAt, validUntil } } : { ok: true, value: null };
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
