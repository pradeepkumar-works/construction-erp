import { createHmac, timingSafeEqual } from 'crypto';
import { AI_DRAFT_LABELS, CAPTURE_SAVE_HOURS, isCaptureSaveKind, normalisePhone, type AiDraftDto, type CaptureSaveKind, type CaptureStatsDto } from '@erp/shared';

/**
 * WhatsApp entries (AI item 120), the parts with no database or network: reading the providers' webhooks, telling a
 * Save or Discard reply from a new message, the reply text, and turning a draft's form values into the create body.
 * Tested in `src/scripts/whatsapp-capture-test.ts`.
 */

/** One message as both providers send it, before anything is looked up. */
export interface InboundEvent {
  from: string;
  /** The provider's message id, to read a retried webhook once */
  providerRef: string | null;
  type: 'TEXT' | 'VOICE' | 'PHOTO' | 'BUTTON' | 'OTHER';
  text: string | null;
  /** Meta: the media id; WATI: the file name or address in `data` */
  media: { ref: string; mimeType: string | null } | null;
  /** A tapped reply button's id (`save:<id>` / `discard:<id>`) */
  buttonId: string | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The messages in a WhatsApp Cloud API webhook (delivery statuses and other changes are left out). */
export function parseMeta(body: unknown): InboundEvent[] {
  const out: InboundEvent[] = [];
  for (const entry of arr(obj(body).entry)) {
    for (const change of arr(obj(entry).changes)) {
      for (const raw of arr(obj(obj(change).value).messages)) {
        const m = obj(raw);
        const from = normalisePhone(str(m.from) ? `+${str(m.from)}` : null);
        if (!from) continue;
        const base = { from, providerRef: str(m.id), text: null, media: null, buttonId: null };
        const type = str(m.type);
        if (type === 'text') out.push({ ...base, type: 'TEXT', text: str(obj(m.text).body) });
        else if (type === 'image') {
          const img = obj(m.image);
          out.push({ ...base, type: 'PHOTO', text: str(img.caption), media: str(img.id) ? { ref: str(img.id)!, mimeType: str(img.mime_type) } : null });
        } else if (type === 'audio') {
          const a = obj(m.audio);
          out.push({ ...base, type: 'VOICE', media: str(a.id) ? { ref: str(a.id)!, mimeType: str(a.mime_type) } : null });
        } else if (type === 'interactive') {
          const reply = obj(obj(m.interactive).button_reply);
          out.push({ ...base, type: 'BUTTON', text: str(reply.title), buttonId: str(reply.id) });
        } else if (type === 'button') {
          const b = obj(m.button);
          out.push({ ...base, type: 'BUTTON', text: str(b.text), buttonId: str(b.payload) });
        } else out.push({ ...base, type: 'OTHER' });
      }
    }
  }
  return out;
}

/** WATI's "message received" webhook: one message; null for its other events and for messages the company sent. */
export function parseWati(body: unknown): InboundEvent | null {
  const m = obj(body);
  if (m.owner === true || (str(m.eventType) && str(m.eventType) !== 'message')) return null;
  const from = normalisePhone(str(m.waId) ? `+${str(m.waId)}` : null);
  if (!from) return null;
  const base = { from, providerRef: str(m.whatsappMessageId) ?? str(m.id), text: null, media: null, buttonId: null };
  const type = str(m.type);
  const data = str(m.data);
  if (type === 'text') return { ...base, type: 'TEXT', text: str(m.text) };
  if (type === 'image') return { ...base, type: 'PHOTO', text: str(m.text), media: data ? { ref: data, mimeType: null } : null };
  if (type === 'audio' || type === 'voice') return { ...base, type: 'VOICE', media: data ? { ref: data, mimeType: null } : null };
  if (type === 'button' || type === 'interactive') {
    const b = obj(m.buttonReply);
    const i = obj(m.interactiveButtonReply);
    return { ...base, type: 'BUTTON', text: str(b.text) ?? str(i.title) ?? str(m.text), buttonId: str(b.payload) ?? str(i.id) };
  }
  return { ...base, type: 'OTHER' };
}

/** Meta signs each webhook with the app secret: `X-Hub-Signature-256: sha256=<hex>` over the exact bytes. */
export function metaSignatureOk(appSecret: string, rawBody: Buffer | string, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const want = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return sameText(want, header.slice(7));
}

export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const SAVE_WORDS = new Set(['1', 'save', 'yes', 'y', 'ok', 'okay', 'haan', 'han', 'ha', 'haa', 'ji', 'theek', 'thik', 'हाँ', 'हां', 'हा', 'ठीक', 'सेव']);
const DISCARD_WORDS = new Set(['2', 'discard', 'no', 'n', 'cancel', 'nahi', 'nahin', 'na', 'mat', 'नहीं', 'ना', 'रद्द']);

/**
 * Whether a message answers the last draft: a tapped button (`save:<id>`), or a short reply that is only a Save or
 * Discard word ("1", "haan", "नहीं"). Anything longer is a new message.
 */
export function replyIntent(e: Pick<InboundEvent, 'type' | 'text' | 'buttonId'>): { action: 'SAVE' | 'DISCARD'; id: string | null } | null {
  const button = e.buttonId?.match(/^(save|discard):([0-9a-f-]{36})$/i);
  if (button) return { action: button[1].toLowerCase() === 'save' ? 'SAVE' : 'DISCARD', id: button[2] };
  if (e.type !== 'TEXT' && e.type !== 'BUTTON') return null;
  const words = (e.text ?? '').toLowerCase().replace(/[.!,।]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 2) return null;
  if (words.every((w) => SAVE_WORDS.has(w))) return { action: 'SAVE', id: null };
  if (words.every((w) => DISCARD_WORDS.has(w))) return { action: 'DISCARD', id: null };
  return null;
}

/** A draft waits for Save this long after its message came. */
export const withinSaveWindow = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() <= CAPTURE_SAVE_HOURS * 3600_000;

/** The draft a message becomes: the first one WhatsApp can save, else the first (a letter, opened in the app). */
export function pickDraft(drafts: AiDraftDto[]): AiDraftDto | null {
  return drafts.find((d) => isCaptureSaveKind(d.kind)) ?? drafts[0] ?? null;
}

/** What is asked of Ask Nirmaan: the words, the voice note as heard, and a note that a photo came with it. */
export function questionOf(e: { type: 'TEXT' | 'VOICE' | 'PHOTO'; text: string | null; transcript: string | null }): string {
  const said = [e.text, e.transcript].filter(Boolean).join('\n').trim();
  if (e.type === 'PHOTO') return said ? `${said}\n(A site photo came with this; it will be attached to what is saved.)` : 'A site photo with no caption. Ask in one line what it shows and what to record.';
  return said;
}

/** WhatsApp shows up to 4096 characters; a reply stays short enough to read at a glance. */
export const REPLY_MAX = 900;
export function fit(text: string, max = REPLY_MAX): string {
  const t = text.replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Markdown links and emphasis from the answer, as plain WhatsApp text: [label](/path) becomes "label". */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^#+\s*/gm, '')
    .trim();
}

/** The reply to a message that became a draft: what it is, what to check, and how to save it. */
export function draftReply(d: AiDraftDto, link: string, opts: { buttons: boolean; voice: boolean }): string {
  const lines = [`${AI_DRAFT_LABELS[d.kind]}, not saved yet:`, d.title];
  if (opts.voice) lines.push('From your voice note: check the figures.');
  for (const f of d.flags.slice(0, 3)) lines.push(`Check: ${f.note}`);
  if (d.flags.length > 3) lines.push(`and ${d.flags.length - 3} more to check`);
  lines.push('');
  if (isCaptureSaveKind(d.kind)) lines.push(opts.buttons ? 'Tap Save to save it in your name, or Discard.' : 'Reply 1 to save it in your name, 2 to discard.');
  // Without WEB_URL the server has no address to give.
  if (link.startsWith('http')) lines.push(`Open or change it: ${link}`);
  return fit(lines.join('\n'));
}

export const NOT_SET_UP_REPLY = 'This number is not set up for WhatsApp entries. Switch them on in Nirmaan under Site, WhatsApp entries, with this number on your profile.';
export const NOTHING_WAITING_REPLY = 'Nothing is waiting to be saved. Send what was done, what is needed or what was spent.';

/**
 * A draft's form values as its create body: quantities and amounts as strings (the API's decimals), empty values left
 * out, and the client id that makes a second Save the same save.
 */
export function createBody(kind: CaptureSaveKind, values: Record<string, unknown>, extra: { id: string; attachmentIds: string[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  const dec = (v: unknown) => (typeof v === 'number' ? String(v) : v);
  if (kind === 'material-request' && Array.isArray(out.items)) out.items = (out.items as Record<string, unknown>[]).map((i) => ({ ...i, quantity: dec(i.quantity) }));
  if (kind === 'progress') out.quantity = dec(out.quantity);
  if (kind === 'expense') {
    out.amount = dec(out.amount);
    if (out.gstRate !== undefined) out.gstRate = dec(out.gstRate);
  }
  return { ...out, id: extra.id, submit: true, ...(extra.attachmentIds.length ? { attachmentIds: extra.attachmentIds } : {}) };
}

/** A validation message for a WhatsApp reply: the first problem, in words. */
export function firstProblem(errors: { property: string; constraints?: Record<string, string>; children?: unknown[] }[]): string {
  const walk = (es: typeof errors, path: string): string | null => {
    for (const e of es) {
      const here = path ? `${path}.${e.property}` : e.property;
      const c = e.constraints && Object.values(e.constraints)[0];
      if (c) return c.startsWith(e.property) ? c.replace(e.property, here) : `${here}: ${c}`;
      const inner = walk((e.children ?? []) as typeof errors, here);
      if (inner) return inner;
    }
    return null;
  };
  return walk(errors, '') ?? 'Something in the draft is missing';
}

/** Over the decided drafts: saved as drafted, changed, discarded. */
export function captureStats(rows: { outcome: 'SAVED' | 'CHANGED' | 'DISCARDED' | null; drafted: boolean }[], days: number): CaptureStatsDto {
  return {
    days,
    drafted: rows.filter((r) => r.drafted).length,
    saved: rows.filter((r) => r.outcome === 'SAVED').length,
    changed: rows.filter((r) => r.outcome === 'CHANGED').length,
    discarded: rows.filter((r) => r.outcome === 'DISCARDED').length,
  };
}
