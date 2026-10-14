import axios, { AxiosError } from 'axios';

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

/** Extracts a human readable message from an API / axios error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('; ') : String(data.message);
    }
    if (err.response?.status === 403) return 'You do not have permission to perform this action';
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
