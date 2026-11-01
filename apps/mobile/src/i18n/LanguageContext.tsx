import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { translate, type TranslateVars } from './translate';
import { setFormatLanguage } from '../utils/format';
import { kvGet, kvSet } from '../utils/kv';

/**
 * The app's display language. The first launch follows the phone's own language when the app has it, so
 * a phone set to Hindi opens in Hindi; a user switches on the intro, the sign-in screen or under Profile, and the
 * choice is kept on this phone.
 */
export type LanguageCode = 'en' | 'hi';

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** `available: false` languages are listed as coming soon until their translations ship. */
export const LANGUAGES: { code: LanguageCode; label: string; available: boolean }[] = [
  { code: 'en', label: 'English', available: true },
  { code: 'hi', label: 'हिन्दी (Hindi)', available: true },
];

const STORAGE_KEY = 'nirmaan.language';

const isSelectable = (v: string | null | undefined): v is LanguageCode => LANGUAGES.some((l) => l.code === v && l.available);

/** The first of the phone's preferred languages the app has, else English. */
function phoneLanguage(): LanguageCode {
  try {
    for (const l of getLocales()) if (isSelectable(l.languageCode)) return l.languageCode;
  } catch {
    // No locale information: English.
  }
  return DEFAULT_LANGUAGE;
}

/** Read synchronously, so the first screen is already in the right language. */
function startLanguage(): { code: LanguageCode; chosen: boolean } {
  const saved = kvGet(STORAGE_KEY);
  return isSelectable(saved) ? { code: saved, chosen: true } : { code: phoneLanguage(), chosen: false };
}

interface LanguageState {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
}

const LanguageContext = createContext<LanguageState>({ language: DEFAULT_LANGUAGE, setLanguage: () => undefined });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [start] = useState(startLanguage);
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    setFormatLanguage(start.code);
    return start.code;
  });

  // A choice made before this version was kept in AsyncStorage: carry it over once.
  useEffect(() => {
    if (start.chosen) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!isSelectable(v)) return;
        kvSet(STORAGE_KEY, v);
        setFormatLanguage(v);
        setLanguageState(v);
      })
      .catch(() => undefined);
  }, [start.chosen]);

  const setLanguage = useCallback((code: LanguageCode) => {
    if (!isSelectable(code)) return;
    setFormatLanguage(code);
    setLanguageState(code);
    kvSet(STORAGE_KEY, code);
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

/**
 * `t('English text', { n: 3 })` in the current language. The English text is the key, so untranslated text shows in
 * English; `{name}` placeholders are filled from `vars`. Shared labels translate the same way: `t(STATUS_LABELS[s])`.
 */
export function useT() {
  const { language } = useLanguage();
  return useCallback((en: string, vars?: TranslateVars) => translate(language, en, vars), [language]);
}
