import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import type { Reading } from './outbox';
import type { Connection } from './state';
import { readReport } from './csv';

/**
 * The batching plant reader: the folder the plant's controller writes its batch reports to, read each run.
 * A file is read again only when it has changed (a day's file grows as trucks are batched), and each row goes as one
 * reading whose id is the row's key, so a row read twice is counted once by Nirmaan. Only the folder is read; nothing
 * is written to it, and the controller's own database is not touched.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Rows a run sends at most; the rest go on the next run */
const MAX_ROWS = 400;

interface Seen {
  size: number;
  mtimeMs: number;
  /** Rows of it sent already, by key */
  sent: Set<string>;
}

const seen = new Map<string, Map<string, Seen>>();
const firstRun = new Set<string>();

const num = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);

/** The rows the controller wrote since the last run, oldest file first. */
export async function readBatchFolder(conn: Connection): Promise<Reading[]> {
  const folder = String(conn.config.folder ?? '');
  const exts = Array.isArray(conn.config.extensions) && conn.config.extensions.length ? conn.config.extensions.map((e) => `.${String(e).toLowerCase()}`) : ['.csv', '.txt'];
  const since = Date.now() - num(conn.config.sinceDays, 2) * 86_400_000;
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch (e) {
    throw new Error(`the folder ${folder} could not be read (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}); check its path and that this computer's account may open it`);
  }
  const files = seen.get(conn.id) ?? new Map<string, Seen>();
  seen.set(conn.id, files);
  const fresh = !firstRun.has(conn.id);
  firstRun.add(conn.id);
  const changed = names
    .filter((n) => exts.includes(extname(n).toLowerCase()))
    .map((n) => {
      try {
        const s = statSync(join(folder, n));
        return s.isFile() ? { name: n, size: s.size, mtimeMs: s.mtimeMs } : null;
      } catch {
        return null;
      }
    })
    .filter((f): f is { name: string; size: number; mtimeMs: number } => !!f)
    .filter((f) => {
      // On the first run an old file is noted as it stands and left; it is read again only if it changes.
      if (fresh && f.mtimeMs < since) {
        files.set(f.name, { size: f.size, mtimeMs: f.mtimeMs, sent: new Set() });
        return false;
      }
      const was = files.get(f.name);
      return !was || was.size !== f.size || was.mtimeMs !== f.mtimeMs;
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  const out: Reading[] = [];
  const problems: string[] = [];
  for (const f of changed) {
    if (out.length >= MAX_ROWS) break;
    if (f.size > MAX_FILE_BYTES) {
      if (!files.has(f.name)) problems.push(`${f.name} is over 5 MB and was left; have the controller write a file a day`);
      files.set(f.name, { size: f.size, mtimeMs: f.mtimeMs, sent: new Set() });
      continue;
    }
    let text: string;
    try {
      text = readFileSync(join(folder, f.name), 'latin1');
    } catch {
      // The controller is writing it; it is read on the next run.
      continue;
    }
    const was = files.get(f.name);
    const sent = was?.sent ?? new Set<string>();
    const { rows } = readReport(basename(f.name), text);
    let all = true;
    for (const row of rows) {
      if (sent.has(row.key)) continue;
      if (out.length >= MAX_ROWS) {
        all = false;
        break;
      }
      sent.add(row.key);
      const at = new Date(f.mtimeMs).toISOString();
      out.push({ id: row.key, connectionId: conn.id, at, payload: { key: row.key, file: basename(f.name), line: row.line, fields: row.fields, fileTime: at } });
    }
    // A file not finished this run keeps its old size, so the next run reads it again for the rest.
    files.set(f.name, all ? { size: f.size, mtimeMs: f.mtimeMs, sent } : { size: -1, mtimeMs: -1, sent });
  }
  if (!out.length && problems.length) throw new Error(problems.join('; '));
  return out;
}
