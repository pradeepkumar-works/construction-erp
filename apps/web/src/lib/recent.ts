'use client';

/** Records the user opened lately, for Search (Ctrl K) before anything is typed. Kept in this browser only. */
export interface RecentRecord {
  href: string;
  title: string;
  /** What it is: "Purchase order", "Vendor bill". */
  kind: string;
  at: number;
}

const KEY = 'nirmaan:recent-records';
const MAX = 8;

export function recentRecords(): RecentRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentRecord[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.href === 'string' && typeof r.title === 'string') : [];
  } catch {
    return [];
  }
}

/** Puts a record at the top of the recent list (once, by its address). */
export function rememberRecord(r: Omit<RecentRecord, 'at'>) {
  try {
    const next = [{ ...r, at: Date.now() }, ...recentRecords().filter((x) => x.href !== r.href)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: nothing to remember.
  }
}

/** Signing out forgets them, so the next person on this browser does not see them. */
export function forgetRecentRecords() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
