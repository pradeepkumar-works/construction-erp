import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { AttachmentDto } from '@erp/shared';
import { useAuth } from '../auth/AuthContext';
import { errorMessage, request, uploadFile, type RequestOptions, type UploadFile } from './client';
import { readCache, writeCache } from '../offline/cache';

/** Small fetch wrapper bound to the current bearer token. */
export function useApi() {
  const { token } = useAuth();
  return useMemo(
    () => ({
      get: <T,>(path: string, query?: RequestOptions['query']) => request<T>(path, { token, query }),
      post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, token }),
      put: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body, token }),
      patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body, token }),
      del: <T,>(path: string) => request<T>(path, { method: 'DELETE', token }),
      upload: (file: UploadFile) => uploadFile<AttachmentDto>(file, token),
    }),
    [token],
  );
}

export type Api = ReturnType<typeof useApi>;

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** True while `data` is the last cached response (the live request failed or is still running). */
  fromCache: boolean;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

interface UseFetchOptions {
  /** Re-run the loader each time the screen gains focus (keeps lists fresh after a submission). */
  refetchOnFocus?: boolean;
  /** Skip loading (e.g. until an id is known). */
  enabled?: boolean;
  /**
   * Keep the last successful result on the device under this key (scoped to the signed-in user).
   * On the next load the cached copy is shown immediately and kept if the request fails offline.
   */
  cacheKey?: string;
}

/**
 * Loads data with loading / refreshing / error states.
 * `loader` receives the bound api; `deps` re-run it (e.g. a route id).
 */
export function useFetch<T>(loader: (api: Api) => Promise<T>, deps: React.DependencyList, opts: UseFetchOptions = {}): FetchState<T> {
  const api = useApi();
  const { user } = useAuth();
  const { refetchOnFocus = true, enabled = true } = opts;
  const cacheKey = opts.cacheKey ? `${user?.id ?? 'anon'}:${opts.cacheKey}` : null;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const hasLoaded = useRef(false);
  const seq = useRef(0);

  const run = useCallback(
    async (mode: 'load' | 'refresh' | 'silent') => {
      if (!enabled) return;
      const id = ++seq.current;
      if (mode === 'load') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      let servedFromCache = false;
      if (cacheKey && mode === 'load' && !hasLoaded.current) {
        const cached = await readCache<T>(cacheKey);
        if (id !== seq.current) return;
        if (cached !== null) {
          servedFromCache = true;
          setData(cached);
          setFromCache(true);
          setError(null);
          setLoading(false);
        }
      }
      try {
        const result = await loaderRef.current(api);
        if (id !== seq.current) return;
        setData(result);
        setFromCache(false);
        setError(null);
        hasLoaded.current = true;
        if (cacheKey) void writeCache(cacheKey, result);
      } catch (e) {
        if (id !== seq.current) return;
        // On a silent refetch, or when a cached copy is on screen, keep showing data rather than an error screen.
        if (!servedFromCache && (mode !== 'silent' || !hasLoaded.current)) setError(errorMessage(e));
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, enabled, cacheKey, ...deps],
  );

  useEffect(() => {
    hasLoaded.current = false;
    void run('load');
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus && hasLoaded.current) void run('silent');
    }, [refetchOnFocus, run]),
  );

  return {
    data,
    loading,
    refreshing,
    error,
    fromCache,
    refresh: () => run('refresh'),
    reload: () => run('load'),
    setData,
  };
}
