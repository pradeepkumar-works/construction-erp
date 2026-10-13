import { getStore } from './db';

/** Last good API responses, keyed per user, so screens still open without a connection. */
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await (await getStore()).getCache(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  try {
    await (await getStore()).setCache(key, JSON.stringify(value));
  } catch {
    // caching is best effort
  }
}
