import axios, { AxiosError } from 'axios';
import { PRODUCT_NAME } from '@erp/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
/** Origin of the API, used to resolve relative upload URLs (e.g. /uploads/...). */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export const TOKEN_KEY = 'erp_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token);
      document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    /* ignore storage errors */
  }
}

/** While staff view a company read-only, their own token waits here and comes back when they leave. */
const STAFF_TOKEN_KEY = 'erp_token_staff';

/** Switches the browser to a read-only support session; the staff token is kept to come back to. */
export function startSupportSession(supportToken: string) {
  const own = getToken();
  try {
    if (own) window.localStorage.setItem(STAFF_TOKEN_KEY, own);
  } catch {
    /* ignore storage errors */
  }
  setToken(supportToken);
}

/** Leaves a support session for the staff member's own sign-in. False when there was none to go back to. */
export function endSupportSession(): boolean {
  if (typeof window === 'undefined') return false;
  let own: string | null = null;
  try {
    own = window.localStorage.getItem(STAFF_TOKEN_KEY);
    window.localStorage.removeItem(STAFF_TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
  if (!own) return false;
  setToken(own);
  return true;
}

export function fileUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // A support session that ran out or was withdrawn goes back to the console rather than the sign-in page.
      if (endSupportSession()) {
        window.location.href = '/platform';
        return Promise.reject(error);
      }
      setToken(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** The HTTP status of a failed request; 0 when the request never got an answer (offline, server down, blocked). */
export function errorStatus(err: unknown): number | undefined {
  if (!axios.isAxiosError(err)) return undefined;
  return err.response ? err.response.status : 0;
}

/** What a failed request means for the person, in plain words (UX item 86). */
export type ErrorKind = 'offline' | 'unreachable' | 'server' | 'forbidden' | 'missing' | 'refused' | 'other';

export const OFFLINE_TEXT = 'You are offline. Your changes are kept; try again when you are back.';
export const UNREACHABLE_TEXT = `Could not reach ${PRODUCT_NAME}. Your changes are kept; check your connection and try again.`;
export const SERVER_TEXT = 'Something went wrong on our side. Try again.';

/** The server's own words for a refusal (a 400's validation messages, a 409's reason), when it gave any. */
function serverWords(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { message?: string | string[] } | undefined;
  if (!data?.message) return null;
  const list = (Array.isArray(data.message) ? data.message : [String(data.message)]).map((m) => {
    const t = String(m).trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  });
  return list.map((m, i) => (i < list.length - 1 && !/[.!?]$/.test(m) ? `${m}.` : m)).join(' ');
}

/**
 * One reading of every API and network failure, used by the notices and forms: offline, unreachable or a server
 * fault in plain words with a retry worth offering; a refusal (validation, conflict, not allowed) in the server's own
 * words, where trying the same again would not help.
 */
export function describeError(err: unknown, fallback = SERVER_TEXT): { kind: ErrorKind; text: string; retry: boolean } {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    if (status === 0) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return { kind: offline ? 'offline' : 'unreachable', text: offline ? OFFLINE_TEXT : UNREACHABLE_TEXT, retry: true };
    }
    if (status >= 500) return { kind: 'server', text: SERVER_TEXT, retry: true };
    const own = serverWords(err);
    if (status === 403) return { kind: 'forbidden', text: own ?? 'You do not have permission to do this', retry: false };
    if (status === 404) return { kind: 'missing', text: own ?? 'It is no longer there; it may have been deleted', retry: false };
    if (status === 408 || status === 429) return { kind: 'server', text: own ?? `${PRODUCT_NAME} is busy right now. Try again in a moment.`, retry: true };
    return { kind: 'refused', text: own ?? fallback, retry: false };
  }
  if (err instanceof Error && err.message) return { kind: 'other', text: err.message, retry: false };
  return { kind: 'other', text: fallback, retry: false };
}

/** A failed request in plain words (see `describeError`). */
export function errorMessage(err: unknown, fallback = SERVER_TEXT): string {
  return describeError(err, fallback).text;
}
