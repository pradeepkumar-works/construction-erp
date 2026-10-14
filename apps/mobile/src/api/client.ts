import { API_URL } from '../config';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | boolean | undefined | null>;
}

let unauthorizedHandler: (() => void) | null = null;
/** Registered by the auth provider so a 401 anywhere logs the user out. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

function buildQuery(query?: RequestOptions['query']) {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    const m = data?.message;
    if (Array.isArray(m)) message = m.join('\n');
    else if (typeof m === 'string') message = m;
  } catch {
    // ignore body parse failure
  }
  return new ApiError(res.status, message);
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Cannot reach the server at ${API_URL}. Check EXPO_PUBLIC_API_URL and that the API is running.`);
  }
  return handle<T>(res);
}

export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/** Multipart upload to POST /uploads. React Native's FormData accepts {uri,name,type}. */
export async function uploadFile<T>(file: UploadFile, token: string | null): Promise<T> {
  const form = new FormData();
  // RN's FormData typing expects Blob; the {uri,name,type} object is the RN convention.
  form.append('file', file as unknown as Blob);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/uploads`, { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError(0, 'Upload failed: cannot reach the server.');
  }
  return handle<T>(res);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
