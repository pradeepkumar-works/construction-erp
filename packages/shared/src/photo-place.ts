/**
 * Where and when a site photo was taken (ARCHITECTURE "Site photos", Place and time). The phone stamps both into the
 * photo's file name, so they travel through the outbox and the upload with the photo itself:
 * `site-20261018-143205-1@20.462501,85.882980~12.jpg` is a photo taken at 14:32:05 on 18 Oct 2026, 12 m from that
 * latitude and longitude. The upload reads the name into the attachment's `takenAt`, `lat`, `lng` and `accuracyM`;
 * a photo is then at the site, away from it, or of no known place, against the project's site location.
 */

/** A photo within this distance of the site's pin (plus its own accuracy) was taken at the site. */
export const PHOTO_NEAR_SITE_M = 500;

export interface PhotoFix {
  lat: number;
  lng: number;
  /** How far off the phone said the fix may be, in metres */
  accuracyM: number | null;
}

export interface PhotoNameRead {
  /** The phone's wall clock when it was taken, "YYYY-MM-DD HH:mm:ss", or null for a name without a stamp */
  takenAt: string | null;
  fix: PhotoFix | null;
}

const NAME = /site-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?(?:@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:~(\d{1,5}))?)?/;

/** Whether a latitude and longitude are on the earth and not the 0,0 a phone gives with no fix. */
export function fixProblem(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'not a number';
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'off the earth';
  if (lat === 0 && lng === 0) return 'no fix';
  return null;
}

/** "@20.462501,85.88298~12": a fix to six places (about 10 cm), its accuracy to the metre. */
export function placeSuffix(fix: PhotoFix): string {
  const acc = fix.accuracyM !== null && Number.isFinite(fix.accuracyM) ? `~${Math.min(99999, Math.max(0, Math.round(fix.accuracyM)))}` : '';
  return `@${Number(fix.lat.toFixed(6))},${Number(fix.lng.toFixed(6))}${acc}`;
}

/** The file name with its fix put before the extension; a name with no fix or an unusable one is left as it is. */
export function withPlace(name: string, fix: PhotoFix | null): string {
  if (!fix || fixProblem(fix.lat, fix.lng)) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}${placeSuffix(fix)}${name.slice(dot)}` : `${name}${placeSuffix(fix)}`;
}

/** The time and place stamped into a photo's name, as far as it has them. */
export function readPhotoName(name: string | null | undefined): PhotoNameRead {
  const m = NAME.exec(name ?? '');
  if (!m) return { takenAt: null, fix: null };
  const [, y, mo, d, h, mi, s, lat, lng, acc] = m;
  const okTime = Number(mo) >= 1 && Number(mo) <= 12 && Number(d) >= 1 && Number(d) <= 31 && Number(h) < 24 && Number(mi) < 60 && Number(s) < 60;
  const takenAt = okTime ? `${y}-${mo}-${d} ${h}:${mi}:${s}` : null;
  if (lat === undefined || lng === undefined || fixProblem(Number(lat), Number(lng))) return { takenAt, fix: null };
  return { takenAt, fix: { lat: Number(lat), lng: Number(lng), accuracyM: acc === undefined ? null : Number(acc) } };
}

/** Metres between two points on the earth (haversine, mean radius). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export type PhotoPlaceKind = 'AT_SITE' | 'AWAY' | 'NO_FIX' | 'NO_SITE';

export interface PhotoPlace {
  kind: PhotoPlaceKind;
  /** From the site's pin, when both are known */
  distanceM: number | null;
}

/**
 * Where a photo was taken against the site: at the site within `PHOTO_NEAR_SITE_M` plus the fix's own accuracy (a
 * phone indoors may be 100 m out), else away; no fix, or a site with no location, says so rather than guess.
 */
export function photoPlace(fix: PhotoFix | null, site: { lat: number; lng: number } | null): PhotoPlace {
  if (!fix) return { kind: 'NO_FIX', distanceM: null };
  if (!site) return { kind: 'NO_SITE', distanceM: null };
  const d = distanceM(fix, site);
  return { kind: d <= PHOTO_NEAR_SITE_M + (fix.accuracyM ?? 0) ? 'AT_SITE' : 'AWAY', distanceM: d };
}

/** "At the site", "1.4 km from the site", "No location", "Site not pinned". */
export function photoPlaceWords(p: PhotoPlace): string {
  if (p.kind === 'AT_SITE') return 'At the site';
  if (p.kind === 'NO_FIX') return 'No location';
  if (p.kind === 'NO_SITE') return 'Site not pinned';
  const d = p.distanceM ?? 0;
  return `${d < 1000 ? `${d} m` : `${(d / 1000).toFixed(1)} km`} from the site`;
}

export type SitePhotoSource = 'PROGRESS' | 'DPR' | 'INSPECTION';

/** One photo on a project's photo timeline, with the record it was filed on. */
export interface SitePhotoDto {
  id: string;
  url: string;
  fileName: string;
  /** The day it belongs to: the day it was taken, else its record's day */
  day: string;
  /** "HH:mm" it was taken, in the company's time zone, or null for a photo with no time */
  time: string | null;
  place: PhotoPlace;
  fix: PhotoFix | null;
  uploadedBy: string;
  record: { kind: SitePhotoSource; id: string; title: string; date: string; status: string };
}

export interface SitePhotosDto {
  projectId: string;
  from: string;
  to: string;
  /** False when the project has no site location, so no photo can be placed against it */
  sitePinned: boolean;
  photos: SitePhotoDto[];
  /** Photos in the range; more than `photos.length` when the timeline was cut at its limit */
  total: number;
  /** How many of the photos shown were taken at the site, away from it, or with no location */
  counts: Record<'AT_SITE' | 'AWAY' | 'NO_FIX', number>;
}

/** The photos as days, newest day first and each day's photos by time (those with no time last). */
export function photoDays<T extends { day: string; time: string | null; id: string }>(photos: T[]): { day: string; photos: T[] }[] {
  const byDay = new Map<string, T[]>();
  for (const p of photos) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, list]) => ({ day, photos: [...list].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.id.localeCompare(b.id)) }));
}

/** How many photos stand where: a site with no pin counts each as no location against it. */
export function placeCounts(places: PhotoPlace[]): Record<'AT_SITE' | 'AWAY' | 'NO_FIX', number> {
  const out = { AT_SITE: 0, AWAY: 0, NO_FIX: 0 };
  for (const p of places) out[p.kind === 'AT_SITE' ? 'AT_SITE' : p.kind === 'AWAY' ? 'AWAY' : 'NO_FIX']++;
  return out;
}
