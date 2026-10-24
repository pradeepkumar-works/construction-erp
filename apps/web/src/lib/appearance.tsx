'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { App as AntApp, ConfigProvider } from 'antd';
import { componentConfig, cssVariablesFor, makeTheme } from './theme';
import { renderEmpty } from '@/components/common/renderEmpty';
import { BRAND } from './brand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

export interface AppearancePrefs {
  mode: ThemeMode;
  density: Density;
}

const KEY = 'nirmaan.appearance';
const DEFAULTS: AppearancePrefs = { mode: 'light', density: 'comfortable' };

function readPrefs(): AppearancePrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<AppearancePrefs>;
    return {
      mode: p.mode === 'dark' || p.mode === 'system' ? p.mode : 'light',
      density: p.density === 'compact' ? 'compact' : 'comfortable',
    };
  } catch {
    return DEFAULTS;
  }
}

const Ctx = createContext<{ prefs: AppearancePrefs; dark: boolean; setPrefs: (p: Partial<AppearancePrefs>) => void }>({
  prefs: DEFAULTS,
  dark: false,
  setPrefs: () => undefined,
});

/** The signed-in user's look on this browser (Light, Dark or the system's; Comfortable or Compact), with a setter. */
export const useAppearance = () => useContext(Ctx);

/** The system asks for less motion (UX item 81): antd's motion is off and charts draw without animating. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Follows the operating system's light or dark setting while the mode is "system". */
function useSystemDark(enabled: boolean) {
  const [dark, setDark] = useState(() => enabled && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (!enabled) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [enabled]);
  return enabled && dark;
}

/**
 * Wraps the signed-in app in the user's theme: the antd algorithms for dark and compact, the matching CSS variables
 * on :root (so plain CSS follows), and its own `App` so messages and modals from `App.useApp()` use the same theme.
 * The public pages and sign-in sit outside it and stay light.
 */
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefsState] = useState<AppearancePrefs>(readPrefs);
  const systemDark = useSystemDark(prefs.mode === 'system');
  const dark = prefs.mode === 'dark' || systemDark;
  const compact = prefs.density === 'compact';

  const setPrefs = useCallback((p: Partial<AppearancePrefs>) => {
    setPrefsState((old) => {
      const next = { ...old, ...p };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Private windows can refuse storage; the choice still holds until the tab closes.
      }
      return next;
    });
  }, []);

  const reducedMotion = useReducedMotion();
  const config = useMemo(() => {
    const base = makeTheme({ dark, compact });
    return reducedMotion ? { ...base, token: { ...base.token, motion: false } } : base;
  }, [dark, compact, reducedMotion]);

  // The page's colour scheme and the browser's bar colour follow the choice; the head script in app/layout.tsx set them
  // before the first paint from the same stored choice, so a dark page never flashes white.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    // The theme's own CSS variables take over from the head script's stand-in colours.
    root.style.removeProperty('background');
    root.style.removeProperty('color-scheme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BRAND.colors.nightLayout : BRAND.colors.canvas);
    return () => {
      delete root.dataset.theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BRAND.colors.canvas);
    };
  }, [dark]);
  const css = useMemo(() => `${cssVariablesFor(config)}:root{color-scheme:${dark ? 'dark' : 'light'}}`, [config, dark]);
  const value = useMemo(() => ({ prefs, dark, setPrefs }), [prefs, dark, setPrefs]);

  return (
    <Ctx.Provider value={value}>
      <ConfigProvider theme={config} {...componentConfig} renderEmpty={renderEmpty}>
        <style>{css}</style>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </Ctx.Provider>
  );
}
