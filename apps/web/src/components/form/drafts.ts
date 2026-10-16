import dayjs from 'dayjs';
import { readPref, writePref } from '@/lib/prefs';

/**
 * A new form's unsaved values, kept in this browser so a refresh or a closed tab does not lose them (UI roadmap item
 * 60). Per user, so two people sharing a site laptop do not see each other's drafts. Dates (dayjs) are stored as
 * `{ $date: ISO }` and come back as dayjs.
 */
export interface Draft<T = unknown> {
  at: number;
  values: T;
}

const PREFIX = 'nirmaan.draft.';
/** Older drafts are dropped the next time the form opens. */
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;

export const draftStorageKey = (userId: string, key: string) => `${PREFIX}${userId}.${key}`;

function pack(v: unknown): unknown {
  if (dayjs.isDayjs(v)) return { $date: v.toISOString() };
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, pack(x)]));
  }
  return v;
}

function unpack(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unpack);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.$date === 'string' && Object.keys(o).length === 1) return dayjs(o.$date);
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, unpack(x)]));
  }
  return v;
}

/** Compares two sets of form values (dates included). */
export const snapshot = (values: unknown) => JSON.stringify(pack(values));

export function readDraft<T>(storageKey: string): Draft<T> | null {
  const d = readPref<Draft | null>(storageKey, null);
  if (!d || typeof d.at !== 'number' || Date.now() - d.at > MAX_AGE_MS) return null;
  return { at: d.at, values: unpack(d.values) as T };
}

export function writeDraft(storageKey: string, values: unknown) {
  writePref(storageKey, { at: Date.now(), values: pack(values) });
}

export function clearDraft(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage blocked; nothing was kept either.
  }
}
