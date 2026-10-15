import { HI } from './hi';

export type TranslateVars = Record<string, string | number | null | undefined>;

/** Fill `{name}` placeholders. */
export function fill(text: string, vars?: TranslateVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, key: string) => (vars[key] === undefined || vars[key] === null ? all : String(vars[key])));
}

/** English text in the given language; English when there is no translation for it. */
export function translate(language: string, en: string, vars?: TranslateVars): string {
  return fill(language === 'hi' ? (HI[en] ?? en) : en, vars);
}
