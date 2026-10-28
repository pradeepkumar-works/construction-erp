import { Appearance } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import type { NavFamily, SubmissionStatus } from '@erp/shared';
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
  /** Android ripple and the pressed wash on rows (UX item 88). */
  ripple: 'rgba(15,27,45,0.12)',
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
  ripple: 'rgba(227,234,244,0.16)',
};

export const colors = { ...(scheme === 'dark' ? DARK : LIGHT), ...TILES };

/**
 * Home's menu icons (the phone launcher): each module's colour family as a soft square with the icon in its own ink, as a
 * phone's home screen. Each ink keeps 3:1 on its fill and on the page in both palettes.
 */
const FAMILY_TINT_LIGHT: Record<NavFamily, { bg: string; fg: string }> = {
  work: { bg: '#E6EEFB', fg: '#1E63D6' },
  materials: { bg: '#DDF1EE', fg: '#0F766E' },
  buying: { bg: '#FDF0D5', fg: '#985606' },
  money: { bg: '#E2F3E9', fg: '#177245' },
  people: { bg: '#EDE9FE', fg: '#6D28D9' },
  business: { bg: '#FDE9DD', fg: '#B23B0B' },
  insight: { bg: '#DFF1F7', fg: '#0E6A85' },
  admin: { bg: '#E9ECF0', fg: '#334155' },
};
const FAMILY_TINT_DARK: Record<NavFamily, { bg: string; fg: string }> = {
  work: { bg: '#16263F', fg: '#8DB8FF' },
  materials: { bg: '#0F2A28', fg: '#5CCFC0' },
  buying: { bg: '#2E2410', fg: '#E9B35A' },
  money: { bg: '#12291E', fg: '#4CC07E' },
  people: { bg: '#231C3D', fg: '#B9A2FF' },
  business: { bg: '#33190F', fg: '#EE8A62' },
  insight: { bg: '#0F2730', fg: '#6CC6E2' },
  admin: { bg: '#1E2733', fg: '#B7C2D1' },
};
export const familyTint = scheme === 'dark' ? FAMILY_TINT_DARK : FAMILY_TINT_LIGHT;

/**
 * Drawing markup ink (item 109), as the web's `BRAND.colors.markup*`. Marks sit on the white of a drawing sheet in either
 * theme, so these do not change with it; a pin's number is `onInk` on its ink.
 */
export const markupInk = { RED: '#D92D20', BLUE: '#1E63D6', GREEN: '#167A3E', ORANGE: '#C2410C', sheet: '#FFFFFF', onInk: '#FFFFFF' } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/** Archivo for headings and the wordmark, loaded in app/_layout.tsx; body text stays on the system font. */
export const fonts = { display: 'Archivo_700Bold', displayHeavy: 'Archivo_800ExtraBold' };

/**
 * Text follows the phone's font size; shared controls (buttons, inputs, chips, badges, tab labels) cap it at this
 * multiple so a label still fits its control. Rows use `minHeight`, so larger text wraps instead of clipping.
 */
export const maxFontScale = 1.6;

/**
 * Sizes for reading outdoors (UX item 88): body text 16, labels and secondary text 14, and nothing under 12 (`small`,
 * for badges and tab labels only). Screens use these rather than their own numbers.
 */
export const fontSize = { small: 12, secondary: 14, body: 16, large: 18 };

export const typography = {
  h1: { fontSize: 26, fontFamily: fonts.display, color: colors.text },
  h2: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  wordmark: { fontSize: 30, fontFamily: fonts.displayHeavy, letterSpacing: 3, color: colors.text },
  h3: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text },
  bodyStrong: { fontSize: fontSize.body, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: fontSize.secondary, color: colors.textMuted },
  label: { fontSize: fontSize.secondary, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
};

/**
 * Touch targets for site use (gloves, sunlight): 48 dp at the least (Material's minimum, UX item 88) for anything
 * tappable, `height` for primary buttons and fields. An icon that must stay small gets `hitSlop` up to `min`.
 */
export const touch = { height: 52, heightSm: 48, min: 48 };

export type IconName = keyof typeof Ionicons.glyphMap;

/** A status's colours plus a shape, so it reads without colour vision and in sun glare (UX item 88). */
export interface Tone {
  fg: string;
  bg: string;
  icon?: IconName;
}

export const statusTone: Record<SubmissionStatus, Tone & { icon: IconName }> = {
  DRAFT: { fg: colors.neutral, bg: colors.neutralSoft, icon: 'ellipse-outline' },
  SUBMITTED: { fg: colors.warning, bg: colors.warningSoft, icon: 'time-outline' },
  APPROVED: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  REJECTED: { fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' },
  CHANGES_REQUESTED: { fg: colors.info, bg: colors.infoSoft, icon: 'create-outline' },
};

/** Shapes for the other status words (open, closed, overdue…), by what they mean rather than their colour. */
export const toneIcon = {
  open: 'ellipse-outline',
  waiting: 'time-outline',
  done: 'checkmark-circle',
  failed: 'close-circle',
  alert: 'alert-circle',
  warning: 'warning',
  info: 'information-circle',
  watch: 'eye-outline',
  closed: 'lock-closed-outline',
  edit: 'create-outline',
} satisfies Record<string, IconName>;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};
