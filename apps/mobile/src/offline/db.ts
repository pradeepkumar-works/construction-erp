import { Platform } from 'react-native';

/**
 * Tiny key/value + outbox store on top of expo-sqlite.
 * Native: one SQLite database (`siteapp.db`) with two tables. Web: an in-memory map mirrored to
 * localStorage, so the web export still runs without the SQLite wasm bundle.
 */

export interface OutboxRow {
  id: string;
  userId: string;
  type: string;
  status: string;
  createdAt: string;
  data: string;
}

interface Store {
  getCache(key: string): Promise<string | null>;
  setCache(key: string, value: string): Promise<void>;
  clearCache(prefix: string): Promise<void>;
  listOutbox(userId: string): Promise<OutboxRow[]>;
  putOutbox(row: OutboxRow): Promise<void>;
  deleteOutbox(id: string): Promise<void>;
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updatedAt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbox_user ON outbox (userId, createdAt);
`;

async function openSqlite(): Promise<Store> {
  // Required lazily so the web bundle never evaluates the native module.
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync('siteapp.db');
  await db.execAsync(SCHEMA);
  return {
    async getCache(key) {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM cache WHERE key = ?', key);
      return row?.value ?? null;
    },
    async setCache(key, value) {
      await db.runAsync('INSERT OR REPLACE INTO cache (key, value, updatedAt) VALUES (?, ?, ?)', key, value, new Date().toISOString());
    },
    async clearCache(prefix) {
      await db.runAsync('DELETE FROM cache WHERE key LIKE ?', `${prefix}%`);
    },
    async listOutbox(userId) {
      return db.getAllAsync<OutboxRow>('SELECT * FROM outbox WHERE userId = ? ORDER BY createdAt ASC', userId);
    },
    async putOutbox(row) {
      await db.runAsync(
        'INSERT OR REPLACE INTO outbox (id, userId, type, status, createdAt, data) VALUES (?, ?, ?, ?, ?, ?)',
        row.id,
        row.userId,
        row.type,
        row.status,
        row.createdAt,
        row.data,
      );
    },
    async deleteOutbox(id) {
      await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
    },
  };
}

function openWeb(): Store {
  const LS_KEY = 'siteapp.offline';
  let cache = new Map<string, string>();
  let outbox = new Map<string, OutboxRow>();
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { cache?: [string, string][]; outbox?: OutboxRow[] };
      cache = new Map(parsed.cache ?? []);
      outbox = new Map((parsed.outbox ?? []).map((r) => [r.id, r]));
    }
  } catch {
    // start empty
  }
  const persist = () => {
    try {
      globalThis.localStorage?.setItem(LS_KEY, JSON.stringify({ cache: [...cache.entries()], outbox: [...outbox.values()] }));
    } catch {
      // ignore quota / private mode
    }
  };
  return {
    async getCache(key) {
      return cache.get(key) ?? null;
    },
    async setCache(key, value) {
      cache.set(key, value);
      persist();
    },
    async clearCache(prefix) {
      for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
      persist();
    },
    async listOutbox(userId) {
      return [...outbox.values()].filter((r) => r.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async putOutbox(row) {
      outbox.set(row.id, row);
      persist();
    },
    async deleteOutbox(id) {
      outbox.delete(id);
      persist();
    },
  };
}

let storePromise: Promise<Store> | null = null;

/** The device store, opened once. Falls back to the web store if SQLite cannot be opened. */
export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = (Platform.OS === 'web' ? Promise.resolve(openWeb()) : openSqlite()).catch((e) => {
      console.warn('[offline] SQLite unavailable, using in-memory store', e);
      return openWeb();
    });
  }
  return storePromise;
}
