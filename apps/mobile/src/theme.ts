import { Appearance } from 'react-native';
import type { SubmissionStatus } from '@erp/shared';
import { kvGet, kvSet } from './utils/kv';

/**
 * Light, dark or the phone's own setting, chosen under Profile > Appearance. Screens build their `StyleSheet`s from
 * `colors` when their module loads, so the palette is picked once, here, when the JS starts; a new choice reloads the
 * app (Profile's `applyAppearance`). The choice is read synchronously (expo-sqlite's key-value store; localStorage on
 * web) so the first frame is already in the right colours.
 */
export type AppearanceChoice = 'light' | 'dark' | 'system';

export const APPEARANCE_CHOICES: { value: AppearanceChoice; label: string }[] = [
  { value: 'system', label: 'Same as phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const APPEARANCE_KEY = 'nirmaan.appearance';

const isChoice = (v: unknown): v is AppearanceChoice => v === 'light' || v === 'dark' || v === 'system';

function readChoice(): AppearanceChoice {
  const v = kvGet(APPEARANCE_KEY);
  return isChoice(v) ? v : 'system';
}

/** Saves the choice; the palette in use changes when the JS next starts. */
export function saveAppearance(choice: AppearanceChoice) {
  kvSet(APPEARANCE_KEY, choice);
}

/** The choice the running palette was picked from. */
export const appearance: AppearanceChoice = readChoice();

export const scheme: 'light' | 'dark' = appearance === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : appearance;

// An explicit choice also sets native pieces (alerts, keyboards, pickers) to match the palette rather than the phone.
if (appearance !== 'system') {
  try {
    Appearance.setColorScheme(appearance);
  } catch {
    // Older OS versions: native pieces follow the phone.
  }
}

/**
 * Icon tiles on the Submit screen: one hue per form, the same in both palettes (as phone settings icons are), always
 * with an `onTile` (white) icon.
 */
const TILES = {
  tileBlue: '#1E63D6',
  tileNavy: '#0B1F3A',
  tileOrange: '#EA580C',
  tileGreen: '#1B7F4B',
  tileBrick: '#C2410C',
  tileAmber: '#B45309',
  tileViolet: '#7C3AED',
  tileTeal: '#0F766E',
  tileCyan: '#0E7490',
  tileSlate: '#334155',
  tileIndigo: '#1D4ED8',
  tileOchre: '#A16207',
  tileLime: '#4D7C0F',
  tileOlive: '#365314',
  tileRed: '#DC2626',
  tileRust: '#9A3412',
  tileCrimson: '#B91C1C',
  onTile: '#FFFFFF',
  /** Icons and text over a photo or the black lightbox scrim. */
  onOverlay: '#FFFFFF',
  /** Behind a sheet or a photo: black in both palettes, so the page dims rather than turning grey at night. */
  scrim: 'rgba(0,0,0,0.55)',
  scrimDeep: 'rgba(0,0,0,0.92)',
};

/**
 * Nirmaan palette (same as the web app's src/lib/brand.ts). `primary` is Nirmaan blue for links, icons and
 * selection, `primaryDark` the blueprint navy for big figures; `brand` is the same blue for the mark and primary
 * buttons, always with `onBrand` (white) text. "Pending" uses brick orange (`warning`) so it never reads as the brand.
 * Every text colour keeps WCAG AA (4.5:1) on `bg`, `surface` and each `*Soft` fill, and `textOnPrimary` on each solid
 * tone (`primary`, `accent`, `success`, `warning`, `danger`, `info`).
 */
const LIGHT = {
  primary: '#1E63D6',
  primaryDark: '#0B1F3A',
  primarySoft: '#E6EEFB',
  brand: '#1E63D6',
  brandSoft: '#DCE8FB',
  onBrand: '#FFFFFF',
  accent: '#A65108',
  accentSoft: '#FFEDD5',
  bg: '#F3F6FA',
  surface: '#FFFFFF',
  border: '#DCE3ED',
  /** Outlines of fields and the off state of radios: 3:1 on white and on the canvas, so empty fields show in sunlight. */
  borderStrong: '#7B8798',
  text: '#0F1B2D',
  textMuted: '#5B6779',
  textOnPrimary: '#FFFFFF',
  success: '#177245',
  successSoft: '#E2F3E9',
  warning: '#B23B0B',
  warningSoft: '#FDE9DD',
  danger: '#C11F1F',
  dangerSoft: '#FEE2E2',
  info: '#7C3AED',
  infoSoft: '#EDE9FE',
  neutral: '#4B5563',
  neutralSoft: '#E9ECF0',
};

/**
 * Night palette (the web app's dark mode): a near-neutral night with a little of the blueprint navy. The tones turn
 * light enough to read as text on the night surfaces, so content on a solid tone (`textOnPrimary`) turns night ink;
 * `brand` stays Nirmaan blue with white text, as on the web. `primaryDark` (big figures) and the solid tones stay dark
 * enough for a white icon on them (3:1, the Home quick actions).
 */
const DARK: typeof LIGHT = {
  primary: '#6EA8FF',
  primaryDark: '#5A93F0',
  primarySoft: '#16253B',
  brand: '#1E63D6',
  brandSoft: '#16253B',
  onBrand: '#FFFFFF',
  accent: '#D67C34',
  accentSoft: '#2B2010',
  bg: '#0B1119',
  surface: '#121A25',
  border: '#2B3747',
  borderStrong: '#66738A',
  text: '#E3EAF4',
  textMuted: '#9AA7B8',
  textOnPrimary: '#0B1119',
  success: '#38A566',
  successSoft: '#11261B',
  warning: '#E9714B',
  warningSoft: '#2E1A12',
  danger: '#EE6466',
  dangerSoft: '#311618',
  info: '#9A7CF2',
  infoSoft: '#221B3D',
  neutral: '#A3AEBD',
  neutralSoft: '#1F2834',
};

export const colors = { ...(scheme === 'dark' ? DARK : LIGHT), ...TILES };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/** Archivo for headings and the wordmark, loaded in app/_layout.tsx; body text stays on the system font. */
export const fonts = { display: 'Archivo_700Bold', displayHeavy: 'Archivo_800ExtraBold' };

/**
 * Text follows the phone's font size; shared controls (buttons, inputs, chips, badges, tab labels) cap it at this
 * multiple so a label still fits its control. Rows use `minHeight`, so larger text wraps instead of clipping.
 */
export const maxFontScale = 1.6;

export const typography = {
  h1: { fontSize: 26, fontFamily: fonts.display, color: colors.text },
  h2: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  wordmark: { fontSize: 30, fontFamily: fonts.displayHeavy, letterSpacing: 3, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
};

/** Minimum touch target height for site use (gloves, sunlight). */
export const touch = { height: 52, heightSm: 44 };

export const statusTone: Record<SubmissionStatus, { fg: string; bg: string }> = {
  DRAFT: { fg: colors.neutral, bg: colors.neutralSoft },
  SUBMITTED: { fg: colors.warning, bg: colors.warningSoft },
  APPROVED: { fg: colors.success, bg: colors.successSoft },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft },
  CHANGES_REQUESTED: { fg: colors.info, bg: colors.infoSoft },
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};
