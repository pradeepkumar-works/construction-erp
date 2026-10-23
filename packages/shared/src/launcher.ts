/**
 * The launcher Home (phase 2, ARCHITECTURE "Launcher Home"): pins and Recent, kept per user on the server so they follow
 * them to every browser and the phone. The tiles themselves come from the navigation tree (`navigation.ts`).
 */
import type { NavPinKind, NavVisitKind } from './enums';

/** Pinned holds at most this many. */
export const LAUNCHER_PIN_MAX = 12;
/** Recent on Home shows this many places. */
export const LAUNCHER_RECENT_SHOWN = 5;
/** Project and record visits kept per user (node visits are all kept: Discover reads "never opened" from them). */
export const LAUNCHER_VISITS_KEPT = 30;
/** The same place is counted again only after this long. */
export const LAUNCHER_VISIT_GAP_MS = 10_000;

export interface NavPinDto {
  id: string;
  kind: NavPinKind;
  /** A node id or a project id. */
  target: string;
  label: string;
  /** Pins sort by this as plain text (`positionBetween`). */
  position: string;
}

export interface NavVisitDto {
  kind: NavVisitKind;
  target: string;
  label: string;
  href: string;
  lastAt: string;
}

/** `GET /launcher`: everything Home needs from the server, in one call. */
export interface LauncherDto {
  pins: NavPinDto[];
  /** Newest first. */
  recent: NavVisitDto[];
}

/** `GET /launcher/badges`: counts waiting on the user, by node id. Only nodes with something waiting are listed. */
export interface LauncherBadgesDto {
  nodes: Record<string, number>;
}

/** `POST /launcher/import`: the old Home's favourites and recent pages from one browser, sent once. */
export interface LauncherImportDto {
  pins: { kind: NavPinKind; target: string; label: string }[];
  visits: { kind: NavVisitKind; target: string; label: string; href: string; at: number }[];
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const digit = (s: string, i: number) => DIGITS.indexOf(s[i]);

/**
 * A position that sorts between `before` and `after` (either may be missing), so moving a pin rewrites only that pin.
 * Positions use 0-9 and a-z, compared as plain text, and never end in 0, so there is always room between two of them.
 */
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new Error(`positionBetween: ${before} is not before ${after}`);
  let out = '';
  let lower = before !== null;
  let upper = after !== null;
  for (let i = 0; ; i++) {
    const lo = lower && i < before!.length ? digit(before!, i) : 0;
    const hi = upper && i < after!.length ? digit(after!, i) : DIGITS.length;
    if (hi - lo > 1) return out + DIGITS[Math.floor((lo + hi) / 2)];
    out += DIGITS[lo];
    if (lo < hi) upper = false;
    if (!lower || i >= before!.length) lower = false;
  }
}

/** Pins in their order. */
export const byPosition = <T extends { position: string }>(pins: T[]): T[] => [...pins].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
