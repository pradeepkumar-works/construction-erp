import { CHROME_INKS, fillBase, fillCss, inkFor, mixHex, nightFillOf, QUIET_SHARE, type NavFill, type NavSettingsDto } from '@erp/shared';
import { colorVar } from './css';
import type { Mode } from './engine';
import { CHROME_PALETTES } from './source/chrome';
import { PALETTE } from './source/palette';

/** What picks the menu's colours: a company's palette and its own fill. */
export type ChromeChoice = Pick<NavSettingsDto, 'palette' | 'fill'>;

/** The fill a choice paints in a theme, or null for Quiet (the chrome roles as they are). */
export function chromeFillOf(choice: ChromeChoice, mode: Mode): NavFill | null {
  if (choice.palette === 'QUIET') return null;
  if (choice.palette === 'CUSTOM') return choice.fill ? (mode === 'dark' ? nightFillOf(choice.fill) : choice.fill) : null;
  return CHROME_PALETTES[choice.palette][mode];
}

const alpha = (hex: string, share: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${share})`;
};

/**
 * The chrome roles a fill sets, as CSS variables: the fill itself, its average for anything mixed from it, the ink that
 * reads on all of it, and the caption, hover and focus drawn from that ink.
 */
export function chromeVarsOf(fill: NavFill): Record<string, string> {
  const ink = inkFor(fill) ?? 'light';
  const inkHex = CHROME_INKS[ink];
  const base = fillBase(fill);
  const v = (role: string) => colorVar(['chrome', role]);
  return {
    [v('bg')]: base,
    [v('fill')]: fillCss(fill),
    [v('ink')]: inkHex,
    [v('deep')]: mixHex(inkHex, base, 0.1),
    [v('hover')]: mixHex(inkHex, base, 0.1),
    [v('caption')]: alpha(inkHex, QUIET_SHARE),
    [v('accent')]: ink === 'light' ? PALETTE.nightLink : PALETTE.chromeAccent,
  };
}

/** The choice for one theme as an inline style (a preview card, the admin's live preview). */
export function chromeStyle(choice: ChromeChoice, mode: Mode): Record<string, string> | undefined {
  const fill = chromeFillOf(choice, mode);
  return fill ? chromeVarsOf(fill) : undefined;
}

/** The choice for both themes as a style sheet over the tokens (`tokenCss`), or null for Quiet. */
export function chromeCss(choice: ChromeChoice): string | null {
  const block = (mode: Mode) => {
    const fill = chromeFillOf(choice, mode);
    return fill ? Object.entries(chromeVarsOf(fill)).map(([k, val]) => `${k}:${val}`).join(';') : null;
  };
  const [light, dark] = [block('light'), block('dark')];
  if (!light || !dark) return null;
  return `:root{${light}}\n[data-theme='dark']{${dark}}`;
}
