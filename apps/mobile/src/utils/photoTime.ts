/**
 * When a site photo was taken (UX item 88), kept in its file name: `site-20261018-143205-1.jpg`. The upload API stores
 * the name with the attachment, so the time travels with the photo through the outbox, onto the server and to the web,
 * without a new field; re-encoding the photo (`shrinkPhoto`) would drop the camera's own EXIF time.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026:10:18 14:32:05" (EXIF DateTimeOriginal) as a local Date. */
function fromExif(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The capture time of a picked photo: the camera's EXIF time when the picker gives it, else now (just taken). */
export function captureTime(exif: Record<string, unknown> | null | undefined, fallback = new Date()): Date {
  return fromExif(exif?.DateTimeOriginal) ?? fromExif(exif?.DateTimeDigitized) ?? fromExif(exif?.DateTime) ?? fallback;
}

/** The file name a photo is uploaded under, carrying its capture time. */
export function stampedName(takenAt: Date, n: number, ext = 'jpg'): string {
  const d = takenAt;
  return `site-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${n}.${ext}`;
}

/** The capture time kept in a stamped file name, as an ISO string, or null for a name without one. */
export function takenAtFromName(name: string | null | undefined): string | null {
  const m = /site-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(name ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
