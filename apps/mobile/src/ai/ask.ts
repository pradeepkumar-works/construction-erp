import { fetch } from 'expo/fetch';
import type { AiAskInput, AiDraftDto, AiStreamEvent } from '@erp/shared';
import { API_URL } from '../config';
import { ApiError } from '../api/client';

/** No word from the server for this long counts as a dropped connection, as for any other request on weak signal. */
const IDLE_TIMEOUT_MS = 45_000;

/**
 * Asks Ask Nirmaan and hands each server-sent event to `onEvent` as it arrives, like the web panel. Uses
 * Expo's fetch, whose body can be read as it streams. A refusal before the answer starts (switched off, allowance used,
 * too many questions today) rejects with the server's message; no connection rejects with an `ApiError` of status 0.
 */
export async function streamAsk(input: AiAskInput, token: string | null, onEvent: (e: AiStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const idle = new AbortController();
  let timer = setTimeout(() => idle.abort(), IDLE_TIMEOUT_MS);
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => idle.abort(), IDLE_TIMEOUT_MS);
  };
  const stop = () => idle.abort();
  signal.addEventListener('abort', stop);
  try {
    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${API_URL}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(input),
        signal: idle.signal,
      });
    } catch {
      if (signal.aborted) return;
      throw new ApiError(0, 'Cannot reach Nirmaan. Check your signal and try again.');
    }
    if (!res.ok || !res.body) {
      let msg = res.status === 401 ? 'Your sign-in has expired. Sign in again.' : 'Something went wrong. Try again.';
      try {
        const data = (await res.json()) as { message?: string | string[] };
        if (data.message) msg = Array.isArray(data.message) ? data.message.join('; ') : data.message;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        if (signal.aborted) return;
        throw new ApiError(0, 'The connection dropped before the answer finished. Ask again.');
      }
      if (chunk.done) break;
      touch();
      buffer += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
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
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

/**
 * Drafts handed from the Ask tab to a form, by a key in the form's route (`/dpr/new?fromAsk=<key>`): a draft is too
 * big for a route parameter. Kept for the app's life, so the form can be opened again from the same answer.
 */
const drafts = new Map<string, AiDraftDto>();

export function keepDraft(key: string, draft: AiDraftDto): string {
  drafts.set(key, draft);
  return key;
}

export function draftFor(key: string | null | undefined): AiDraftDto | null {
  return key ? (drafts.get(key) ?? null) : null;
}
