/**
 * When a site photo was taken, kept in its file name: `site-20261018-143205-1.jpg`. The upload API stores
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

/** A degree value from EXIF: a number, "20/1,27/1,4500/100" or [20, 27, 45]. */
function degrees(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parts = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/).filter(Boolean) : null;
  if (!parts?.length) return null;
  const nums = parts.map((p) => {
    if (typeof p === 'number') return p;
    const [a, b] = String(p).split('/').map(Number);
    return b === undefined ? a : b ? a / b : NaN;
  });
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return (nums[0] ?? 0) + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600;
}

/**
 * Where a picked photo was taken, from the camera's EXIF GPS (Android's flat GPSLatitude… tags or iOS's "{GPS}" block),
 * or null when the photo has none (ARCHITECTURE "Site photos", Place and time).
 */
export function exifFix(exif: Record<string, unknown> | null | undefined): { lat: number; lng: number; accuracyM: number | null } | null {
  if (!exif) return null;
  const gps = (exif['{GPS}'] as Record<string, unknown> | undefined) ?? {};
  const lat = degrees(exif.GPSLatitude ?? gps.Latitude);
  const lng = degrees(exif.GPSLongitude ?? gps.Longitude);
  if (lat === null || lng === null) return null;
  const s = String(exif.GPSLatitudeRef ?? gps.LatitudeRef ?? 'N').toUpperCase().startsWith('S') ? -1 : 1;
  const w = String(exif.GPSLongitudeRef ?? gps.LongitudeRef ?? 'E').toUpperCase().startsWith('W') ? -1 : 1;
  const acc = degrees(exif.GPSHPositioningError ?? gps.HPositioningError);
  return { lat: s * Math.abs(lat), lng: w * Math.abs(lng), accuracyM: acc === null ? null : Math.round(acc) };
}
