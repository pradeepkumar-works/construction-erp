import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthUser, LoginResponse } from '@erp/shared';
import { request, setUnauthorizedHandler } from '../api/client';

const TOKEN_KEY = 'siteapp.token';
const USER_KEY = 'siteapp.user';

/** SecureStore is native-only; fall back to localStorage on web so the web export still runs. */
const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  /** True until the stored session has been read. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const signOut = useCallback(async () => {
    setUser(null);
    setToken(null);
    await Promise.all([storage.remove(TOKEN_KEY), storage.remove(USER_KEY)]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u) as AuthUser);
          // Validate the token in the background; a 401 triggers signOut via the handler.
          request<AuthUser>('/auth/me', { token: t })
            .then((fresh) => {
              setUser(fresh);
              void storage.set(USER_KEY, JSON.stringify(fresh));
            })
            .catch(() => undefined);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await request<LoginResponse>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
    setToken(res.accessToken);
    setUser(res.user);
    await Promise.all([storage.set(TOKEN_KEY, res.accessToken), storage.set(USER_KEY, JSON.stringify(res.user))]);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const fresh = await request<AuthUser>('/auth/me', { token });
    setUser(fresh);
    await storage.set(USER_KEY, JSON.stringify(fresh));
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({ user, token, ready, signIn, signOut, refreshUser }),
    [user, token, ready, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
