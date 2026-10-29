import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'fs';

/** A reading waiting to be sent: its id makes a resend harmless, as the server counts each id once. */
export interface Reading {
  id: string;
  connectionId: string;
  at: string;
  payload: Record<string, unknown>;
}

/** About a week of a reading a minute from a dozen devices; past that the oldest go first. */
export const OUTBOX_MAX = 100_000;

/** The lines of an outbox file that read as readings; a line cut short by a power cut is left out. */
export function parseOutbox(text: string): Reading[] {
  const out: Reading[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as Reading;
      if (r && typeof r.id === 'string' && typeof r.connectionId === 'string') out.push(r);
    } catch {
      // a half-written line
    }
  }
  return out;
}

/** What is kept after adding: everything, or the newest OUTBOX_MAX, and how many old ones were dropped. */
export function capOutbox(readings: Reading[], max = OUTBOX_MAX): { kept: Reading[]; dropped: number } {
  return readings.length <= max ? { kept: readings, dropped: 0 } : { kept: readings.slice(readings.length - max), dropped: readings.length - max };
}

/** What is left once a batch was sent and the server answered for it (taken in, a duplicate, or refused for good). */
export const afterSent = (readings: Reading[], sent: Reading[]) => {
  const ids = new Set(sent.map((r) => r.id));
  return readings.filter((r) => !ids.has(r.id));
};

/** The outbox on disk: one reading per line, appended as read, rewritten whole only after a batch is answered. */
export class Outbox {
  constructor(private file: string) {}

  all(): Reading[] {
    return existsSync(this.file) ? parseOutbox(readFileSync(this.file, 'utf8')) : [];
  }

  size() {
    return this.all().length;
  }

  add(readings: Reading[]): number {
    if (!readings.length) return 0;
    // Starts on a new line, so a line cut short by a power cut does not swallow the first new reading.
    appendFileSync(this.file, '\n' + readings.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const all = this.all();
    const { kept, dropped } = capOutbox(all);
    if (dropped) this.write(kept);
    return dropped;
  }

  remove(sent: Reading[]) {
    this.write(afterSent(this.all(), sent));
  }

  private write(readings: Reading[]) {
    writeFileSync(`${this.file}.tmp`, readings.map((r) => JSON.stringify(r) + '\n').join(''));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
