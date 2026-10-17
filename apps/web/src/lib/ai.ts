'use client';

import type { AiAskInput, AiStreamEvent } from '@erp/shared';
import { API_URL, getToken } from './api';

/**
 * Asks Ask Nirmaan a question and hands each server-sent event to `onEvent` as it arrives. A refusal before the answer
 * starts (switched off, allowance used, too many questions today) rejects with the server's message.
 */
export async function streamAsk(input: AiAskInput, onEvent: (e: AiStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/ai/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = res.status === 401 ? 'Your sign-in has expired. Sign in again.' : 'Something went wrong. Try again.';
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data.message) msg = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as AiStreamEvent);
      } catch {
        /* a broken event is skipped */
      }
    }
  }
}
