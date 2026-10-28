'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, LoginResponse } from '@erp/shared';
import { api, endSupportSession, getToken, setToken } from './api';
import { forgetRecentRecords } from './recent';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Start a session from a sign-up or set-password response. */
  signIn: (resp: LoginResponse) => void;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Moves this browser to the person's place in another company of the group, and opens its Home. */
  switchCompany: (organizationId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      setUser(data);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const signIn = useCallback((data: LoginResponse) => {
    setToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    endSupportSession();
    forgetRecentRecords();
    setToken(null);
    setUser(null);
    router.replace('/login');
  }, [router]);

  const switchCompany = useCallback(async (organizationId: string) => {
    const { data } = await api.post<LoginResponse>('/auth/switch', { organizationId });
    // Records opened lately belong to the company left; a full load starts every list, filter and cache afresh.
    forgetRecentRecords();
    setToken(data.accessToken);
    window.location.assign('/');
  }, []);

  const value = useMemo(() => ({ user, loading, login, signIn, logout, refresh, switchCompany }), [user, loading, login, signIn, logout, refresh, switchCompany]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
