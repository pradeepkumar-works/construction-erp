import { createHmac, timingSafeEqual } from 'crypto';

/**
 * A stored file is opened only through a signed link (`/api/uploads/<id>/content?e=…&s=…`), handed out in the
 * attachment DTOs of a record its reader may see. An `<img>` or a new tab sends no Authorization header, so the
 * link carries the proof: an expiry and an HMAC of the id and that expiry under the sign-in key. A bare id, an old
 * link or one copied out of the app stops working within two hours.
 */

/** A link is good for at least one window and at most two. */
export const FILE_LINK_WINDOW_S = 60 * 60;

/**
 * When a link made at `nowS` stops working: the end of the window after this one. Every link to a file made within
 * one window is the same URL, so a browser keeps the file cached instead of fetching it on each page load.
 */
export function fileLinkExpiry(nowS: number): number {
  return (Math.floor(nowS / FILE_LINK_WINDOW_S) + 2) * FILE_LINK_WINDOW_S;
}

function signature(id: string, expiry: number, secret: string): string {
  return createHmac('sha256', `file-link:${secret}`).update(`${id}.${expiry}`).digest('base64url');
}

/** The query string that opens file `id` until the end of the next window. */
export function fileLinkQuery(id: string, nowS: number, secret: string): string {
  const e = fileLinkExpiry(nowS);
  return `e=${e}&s=${signature(id, e, secret)}`;
}

export type FileLinkProblem = 'missing' | 'invalid' | 'expired';

/** Null when the link opens file `id` at `nowS`. */
export function fileLinkProblem(id: string, e: unknown, s: unknown, nowS: number, secret: string): FileLinkProblem | null {
  if (typeof e !== 'string' || typeof s !== 'string' || !e || !s) return 'missing';
  if (!/^\d{1,12}$/.test(e)) return 'invalid';
  const expiry = Number(e);
  const want = Buffer.from(signature(id, expiry, secret));
  const got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  if (expiry <= nowS) return 'expired';
  return null;
}

const FILE_PATH = /\/api\/uploads\/([0-9a-f-]{36})\/content/i;

/** The file a link points at, signed or not; null for any other URL. Reads links kept in saved copies. */
export function fileIdOfLink(url: string): string | null {
  return FILE_PATH.exec(url)?.[1] ?? null;
}
