import type { NavPalette } from './enums';

/**
 * The menu's colours (Menu and names, ARCHITECTURE "Menu colours"): the sidebar, the header in the sidebar-and-header look
 * and the coloured top bar are painted in one fill, a plain colour or a two-stop gradient. The curated palettes are design
 * tokens on the web (`ds/source/chrome.ts`); a company's own fill is held here to one rule, so it always reads: the menu's
 * quietest words (its ink at `QUIET_SHARE`, the captions) keep 4.5:1 against every part of the fill, in both themes.
 */

export type NavFill = { kind: 'SOLID'; color: string } | { kind: 'GRADIENT'; from: string; to: string; angle: NavGradientAngle };

/** Gradient directions: down the rail, across the bar, and corner to corner. */
export const NAV_GRADIENT_ANGLES = [180, 90, 135] as const;
export type NavGradientAngle = (typeof NAV_GRADIENT_ANGLES)[number];

/** The menu's two inks: near-black on a light fill, white on a dark one. */
export const CHROME_INKS = { dark: '#09090B', light: '#FFFFFF' } as const;
export type ChromeInk = keyof typeof CHROME_INKS;

/** What the night theme mixes a light fill into, so a pale company colour becomes a tinted near-black rail. */
const NIGHT_BASE = '#0E0E10';

/** The share of ink the menu's captions are drawn in (Sidebar.module.css mixes no less). */
export const QUIET_SHARE = 0.6;
export const MENU_CONTRAST = 4.5;

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColour = (s: unknown): s is string => typeof s === 'string' && HEX.test(s);

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hexOf = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** `a` at `share`, the rest `b` (CSS `color-mix(in srgb, a share, b)`). */
export function mixHex(a: string, b: string, share: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hexOf([0, 1, 2].map((i) => x[i] * share + y[i] * (1 - share)) as Rgb);
}

function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of two solid colours. */
export function contrastOf(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const fillStops = (f: NavFill): string[] => (f.kind === 'SOLID' ? [f.color] : [f.from, f.to]);

/** Points along the fill to check: a gradient's ends and three between (sRGB, as the browser draws it). */
const samples = (f: NavFill): string[] => (f.kind === 'SOLID' ? [f.color] : [0, 0.25, 0.5, 0.75, 1].map((t) => mixHex(f.to, f.from, t)));

/** The weakest contrast the menu's captions get over the fill in this ink. */
export function weakestContrast(f: NavFill, ink: ChromeInk): number {
  return Math.min(...samples(f).map((bg) => contrastOf(mixHex(CHROME_INKS[ink], bg, QUIET_SHARE), bg)));
}

/** The ink that reads over the whole fill (the better of the two), or null when neither does. */
export function inkFor(f: NavFill): ChromeInk | null {
  const best = (['light', 'dark'] as const).map((ink) => [ink, weakestContrast(f, ink)] as const).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= MENU_CONTRAST ? best[0] : null;
}

/** The colour a fill averages to: a solid's own, a gradient's middle (for hovers and edges mixed from it). */
export const fillBase = (f: NavFill): string => (f.kind === 'SOLID' ? f.color : mixHex(f.from, f.to, 0.5));

/** The fill as a CSS background. */
export const fillCss = (f: NavFill): string => (f.kind === 'SOLID' ? f.color : `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})`);

const mapStops = (f: NavFill, g: (c: string) => string): NavFill => (f.kind === 'SOLID' ? { ...f, color: g(f.color) } : { ...f, from: g(f.from), to: g(f.to) });

/**
 * A company's fill in the night theme: a dark fill a step deeper, a light one mixed into the night's near-black (a pale
 * sand stays a warm near-black rail rather than a bright band beside the dark page).
 */
export function nightFillOf(f: NavFill): NavFill {
  const light = inkFor(f) === 'dark' || (inkFor(f) === null && luminance(fillBase(f)) > 0.18);
  return mapStops(f, (c) => (light ? mixHex(c, NIGHT_BASE, 0.12) : mixHex(c, '#000000', 0.8)));
}

/** Why a company's own fill cannot be saved, in words that say what to do; null when it reads in both themes. */
export function navFillProblem(f: unknown): string | null {
  const fill = readNavFill(f);
  if (!fill) return 'Choose a colour for the menu, or two for a gradient.';
  if (!inkFor(fill)) {
    return fill.kind === 'GRADIENT' && Math.abs(luminance(fill.from) - luminance(fill.to)) > 0.2
      ? 'The two colours are too far apart for the menu’s words to read on both. Pick two dark colours or two light ones.'
      : 'The menu’s words would be hard to read on this colour. Pick a darker or a lighter shade, or use the readable shade.';
  }
  if (!inkFor(nightFillOf(fill))) return 'This colour does not read in the dark theme. Pick a darker shade.';
  return null;
}

/**
 * The nearest fill that reads: each stop taken toward black (for white words) or toward white (for dark words) in small
 * steps, whichever changes the colour less. What "Use a readable shade" sets.
 */
export function readableFill(f: NavFill): NavFill {
  if (!navFillProblem(f)) return f;
  const tries = (['light', 'dark'] as const).map((ink) => {
    const toward = ink === 'light' ? '#000000' : '#FFFFFF';
    for (let step = 1; step <= 20; step++) {
      const next = mapStops(f, (c) => mixHex(c, toward, 1 - step * 0.05));
      if (inkFor(next) === ink && !navFillProblem(next)) return { step, fill: next };
    }
    return null;
  });
  const found = tries.filter((t): t is { step: number; fill: NavFill } => !!t).sort((a, b) => a.step - b.step)[0];
  return found?.fill ?? f;
}

/** A fill read from storage or a request: anything malformed is null. Hex is kept upper case. */
export function readNavFill(v: unknown): NavFill | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.kind === 'SOLID' && isHexColour(o.color)) return { kind: 'SOLID', color: o.color.toUpperCase() };
  if (o.kind === 'GRADIENT' && isHexColour(o.from) && isHexColour(o.to) && (NAV_GRADIENT_ANGLES as readonly unknown[]).includes(o.angle)) {
    return { kind: 'GRADIENT', from: o.from.toUpperCase(), to: o.to.toUpperCase(), angle: o.angle as NavGradientAngle };
  }
  return null;
}

/** The curated palettes that are gradients (the rest are plain colours); the screen groups them so. */
export const GRADIENT_PALETTES: readonly NavPalette[] = ['DUSK', 'OCEAN', 'EMBER', 'MIDNIGHT', 'DAWN'];
