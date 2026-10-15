import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The app's display language. English is the default on every first launch, whatever the phone's own
 * language is: the app never reads the device locale. A user switches language under Profile, and the
 * choice is kept on this phone.
 */
export type LanguageCode = 'en' | 'hi';

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** `available: false` languages are listed as coming soon until their translations ship (v4 item 49). */
export const LANGUAGES: { code: LanguageCode; label: string; available: boolean }[] = [
  { code: 'en', label: 'English', available: true },
  { code: 'hi', label: 'हिन्दी (Hindi)', available: false },
];

const STORAGE_KEY = 'nirmaan.language';

const isSelectable = (v: string | null): v is LanguageCode => LANGUAGES.some((l) => l.code === v && l.available);

interface LanguageState {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
}

const LanguageContext = createContext<LanguageState>({ language: DEFAULT_LANGUAGE, setLanguage: () => undefined });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => isSelectable(v) && setLanguageState(v))
      .catch(() => undefined);
  }, []);

  const setLanguage = useCallback((code: LanguageCode) => {
    if (!isSelectable(code)) return;
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
