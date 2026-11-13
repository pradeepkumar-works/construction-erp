import { Appearance } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { statusTone as sharedStatusTone, type StatusKind, type StatusMeaning, type StatusOf, type SubmissionStatus } from '@erp/shared';
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

/** Black in both palettes, so the page dims rather than turning grey at night. */
const FIXED = {
  /** Icons and text over a photo or the black lightbox scrim. */
  onOverlay: '#FFFFFF',
  /** Behind a sheet or a photo. */
  scrim: 'rgba(0,0,0,0.55)',
  scrimDeep: 'rgba(0,0,0,0.92)',
  /** A count of things waiting (a tile's badge, the tab bar), as the web's: brick on both palettes, white figures. */
  countFill: '#C2410C',
  onCount: '#FFFFFF',
};

/**
 * The Quiet look, as the web's design tokens (apps/web/src/ds/source, docs/design/REDESIGN.md): neutral greys, a
 * near-black primary button (`action`, near-white at night), and blue kept for links, focus, the chosen item, data and
 * AI (`primary`). `brand` is Nirmaan blue for the mark only. Every text colour keeps WCAG AA (4.5:1) on `bg`, `surface`
 * and each `*Soft` fill; field outlines (`borderStrong`) keep 3:1, so an empty field still shows in sunlight.
 */
const LIGHT = {
  primary: '#1A56BF',
  /** Big figures: the strong text colour, as the web's figures. */
  primaryDark: '#09090B',
  primarySoft: '#EEF4FD',
  brand: '#1E63D6',
  brandSoft: '#EEF4FD',
  onBrand: '#FFFFFF',
  /** The primary button: the one strong fill on a screen. */
  action: '#18181B',
  onAction: '#FFFFFF',
  accent: '#B45309',
  accentSoft: '#FDF0E6',
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  borderStrong: '#82828C',
  text: '#18181B',
  textMuted: '#52525B',
  textOnPrimary: '#FFFFFF',
  success: '#167A3E',
  successSoft: '#E8F5EC',
  warning: '#C2410C',
  warningSoft: '#FDF0E6',
  danger: '#CF1322',
  dangerSoft: '#FDECEC',
  info: '#6D28D9',
  infoSoft: '#F1EBFD',
  neutral: '#52525B',
  neutralSoft: '#F4F4F5',
  /** Android ripple and the pressed wash on rows. */
  ripple: 'rgba(9,9,11,0.08)',
};

/**
 * Night palette (the web's dark theme): a neutral near-black. The tones turn light enough to read as text on the night
 * surfaces, so content on a solid tone (`textOnPrimary`) turns night ink, and the primary button turns near-white.
 */
const DARK: typeof LIGHT = {
  primary: '#6EA8FF',
  primaryDark: '#EDEDEF',
  primarySoft: '#202939',
  brand: '#1E63D6',
  brandSoft: '#202939',
  onBrand: '#FFFFFF',
  action: '#EDEDEF',
  onAction: '#09090B',
  accent: '#F6AD55',
  accentSoft: '#362A1E',
  bg: '#09090B',
  surface: '#111113',
  border: '#2E2E33',
  borderStrong: '#71717A',
  text: '#EDEDEF',
  textMuted: '#A1A1AA',
  textOnPrimary: '#09090B',
  success: '#5FD08A',
  successSoft: '#1E3026',
  warning: '#F6AD55',
  warningSoft: '#362A1E',
  danger: '#F26D6F',
  dangerSoft: '#352022',
  info: '#B794F4',
  infoSoft: '#2C2637',
  neutral: '#B4B4BB',
  neutralSoft: '#27272A',
  ripple: 'rgba(237,237,239,0.12)',
};

export const colors = { ...(scheme === 'dark' ? DARK : LIGHT), ...FIXED };

/**
 * A tile's icon (Home's menu, a module's pages, Search, the Submit list): one ink on a soft grey square for every module,
 * as the web's launcher, so colour on a tile is only what waits there.
 */
export const tileInk = { bg: colors.neutralSoft, fg: colors.text };

/**
 * Drawing markup ink, as the web's `sheet.markup` roles. Marks sit on the white of a drawing sheet in either
 * theme, so these do not change with it; a pin's number is `onInk` on its ink.
 */
export const markupInk = { RED: '#D92D20', BLUE: '#1E63D6', GREEN: '#167A3E', ORANGE: '#C2410C', sheet: '#FFFFFF', onInk: '#FFFFFF' } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

/**
 * Inter, the web's one face, for titles, figures and the wordmark (Semibold, as the web's titles), loaded in
 * app/_layout.tsx. Body text stays on the system font, which on Android is the near-identical Roboto: a custom face
 * needs a file per weight, and body text uses several.
 */
export const fonts = { display: 'Inter_600SemiBold', displayHeavy: 'Inter_700Bold' };

/**
 * Text follows the phone's font size; shared controls (buttons, inputs, chips, badges, tab labels) cap it at this
 * multiple so a label still fits its control. Rows use `minHeight`, so larger text wraps instead of clipping.
 */
export const maxFontScale = 1.6;

/**
 * Sizes for reading outdoors: body text 16, labels and secondary text 14, and nothing under 12 (`small`,
 * for badges and tab labels only). Screens use these rather than their own numbers.
 */
export const fontSize = { small: 12, secondary: 14, body: 16, large: 18 };

export const typography = {
  h1: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.text },
  h2: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  wordmark: { fontSize: 30, fontFamily: fonts.displayHeavy, letterSpacing: 2, color: colors.text },
  h3: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text },
  bodyStrong: { fontSize: fontSize.body, fontWeight: '600' as const, color: colors.text },
  caption: { fontSize: fontSize.secondary, color: colors.textMuted },
  label: { fontSize: fontSize.secondary, fontWeight: '600' as const, color: colors.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
};

/**
 * Touch targets for site use (gloves, sunlight): 48 dp at the least (Material's minimum) for anything
 * tappable, `height` for primary buttons and fields. An icon that must stay small gets `hitSlop` up to `min`.
 */
export const touch = { height: 52, heightSm: 48, min: 48 };

export type IconName = keyof typeof Ionicons.glyphMap;

/** A status's colours plus a shape, so it reads without colour vision and in sun glare. */
export interface Tone {
  fg: string;
  bg: string;
  icon?: IconName;
}

/**
 * A status's look by what it means (`statusTone(kind, status)` in @erp/shared, the web's tags too): what waits on someone
 * is amber, what is in hand blue, what failed or was sent back red, each on its soft fill; what is done reads as plain
 * text and what is closed as muted text, so the rows that need someone stand out of a list.
 */
export const meaningTone: Record<StatusMeaning, Tone & { icon: IconName }> = {
  waiting: { fg: colors.warning, bg: colors.warningSoft, icon: 'time-outline' },
  inHand: { fg: colors.primary, bg: colors.primarySoft, icon: 'ellipse-outline' },
  failed: { fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' },
  done: { fg: colors.text, bg: 'transparent', icon: 'checkmark-circle' },
  closed: { fg: colors.textMuted, bg: 'transparent', icon: 'lock-closed-outline' },
};

/** The tone of `status` for a `kind` of record, with a shape of its own where the status asks for one. */
export function toneOf<K extends StatusKind>(kind: K, status: StatusOf<K>, icon?: IconName): Tone & { icon: IconName } {
  const tone = meaningTone[sharedStatusTone(kind, status)];
  return icon ? { ...tone, icon } : tone;
}

export const statusTone: Record<SubmissionStatus, Tone & { icon: IconName }> = {
  DRAFT: toneOf('submission', 'DRAFT'),
  SUBMITTED: toneOf('submission', 'SUBMITTED'),
  APPROVED: toneOf('submission', 'APPROVED'),
  REJECTED: toneOf('submission', 'REJECTED'),
  CHANGES_REQUESTED: toneOf('submission', 'CHANGES_REQUESTED', 'create-outline'),
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
