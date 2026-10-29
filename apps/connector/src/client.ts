import type { Reading } from './outbox';
import type { Settings } from './state';

export const VERSION = '0.3.0';

/** The server refused the token: the Connector was removed or paired again elsewhere. */
export class NotPairedError extends Error {}

async function call<T>(api: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${api.replace(/\/+$/, '')}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-connector-version': VERSION,
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.status === 401) throw new NotPairedError((data as { message?: string })?.message ?? 'Not paired');
  if (!res.ok) throw new Error(`${res.status} ${(data as { message?: string })?.message ?? res.statusText}`);
  return data as T;
}

export const pair = (api: string, code: string, hostname: string) =>
  call<{ token: string; agentId: string; name: string }>(api, '/connector/pair', { method: 'POST', body: { code, hostname, version: VERSION } });

export const fetchSettings = (api: string, token: string) => call<Settings>(api, '/connector/config', { token });

export interface ReadingsResult {
  accepted: number;
  duplicates: number;
  failed: number;
  problems: string[];
}

export const sendReadings = (api: string, token: string, readings: Reading[]) => call<ReadingsResult>(api, '/connector/readings', { method: 'POST', token, body: { readings } });
