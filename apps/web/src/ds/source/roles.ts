import type { PaletteKey } from './palette';

export interface Pair {
  readonly light: PaletteKey;
  readonly dark: PaletteKey;
}

const p = (light: PaletteKey, dark: PaletteKey = light): Pair => ({ light, dark });

export interface ToneRoles {
  readonly fg: Pair;
  readonly bg: Pair;
  readonly notice: Pair;
  readonly solid: Pair;
  readonly line: Pair;
}

export const TONES = ['neutral', 'info', 'pending', 'success', 'danger', 'violet'] as const;
export type Tone = (typeof TONES)[number];

export const ROLES = {
  surface: {
    canvas: p('canvas', 'nightLayout'),
    base: p('white', 'nightSurface'),
    raised: p('white', 'nightElevated'),
    /** Below the page: a table's header and footer, a drawer's foot, a bordered fact's label. */
    sunken: p('canvas', 'nightElevated'),
    inverse: p('ink', 'primaryDeep'),
    scrim: p('scrim', 'nightScrim'),
  },
  text: {
    /** antd's text seed: headings and the colour every other text shade is drawn from. */
    strong: p('black', 'nightText'),
    base: p('textBase', 'nightTextBody'),
    muted: p('textMuted', 'nightTextMuted'),
    faint: p('textTertiary', 'nightTextTertiary'),
    placeholder: p('textPlaceholder', 'nightTextPlaceholder'),
    link: p('link', 'nightLink'),
    linkHover: p('pending', 'accentLight'),
    onAccent: p('onAccent'),
  },
  line: {
    hairline: p('hairline', 'nightBorderSoft'),
    base: p('borderStrong', 'nightBorder'),
    focus: p('accent', 'nightLink'),
    ring: p('ring', 'nightRing'),
  },
  accent: {
    solid: p('accent'),
    hover: p('accentDeep'),
    text: p('link', 'nightLink'),
    soft: p('accentSoft', 'nightAccentSoft'),
    chosen: p('accentChosen', 'nightAccentChosen'),
  },
  tone: {
    neutral: { fg: p('muted', 'nightNeutralText'), bg: p('neutralBg', 'nightNeutralBg'), notice: p('neutralBg', 'nightNeutralBg'), solid: p('muted', 'nightNeutralText'), line: p('border', 'nightBorder') },
    info: { fg: p('link', 'nightLink'), bg: p('accentSoft', 'nightToneInfoBg'), notice: p('accentSoft', 'nightInfoBg'), solid: p('accent', 'nightLink'), line: p('accentChosen', 'nightToneInfoBg') },
    pending: { fg: p('pending', 'nightPending'), bg: p('pendingBg', 'nightTonePendingBg'), notice: p('pendingBg', 'nightPendingBg'), solid: p('pending', 'nightPending'), line: p('pendingBg', 'nightTonePendingBg') },
    success: { fg: p('success', 'nightSuccess'), bg: p('successBg', 'nightToneSuccessBg'), notice: p('successBg', 'nightSuccessBg'), solid: p('success', 'nightSuccess'), line: p('successBorder', 'nightToneSuccessBg') },
    danger: { fg: p('danger', 'nightDanger'), bg: p('dangerBg', 'nightToneDangerBg'), notice: p('dangerBg', 'nightDangerBg'), solid: p('danger', 'nightDanger'), line: p('dangerBg', 'nightToneDangerBg') },
    violet: { fg: p('violet', 'nightViolet'), bg: p('violetBg', 'nightToneVioletBg'), notice: p('violetBg', 'nightToneVioletBg'), solid: p('violet', 'nightViolet'), line: p('violetBg', 'nightToneVioletBg') },
  } satisfies Record<Tone, ToneRoles>,
  chrome: {
    bg: p('ink'),
    deep: p('inkDeep'),
    hover: p('primaryDeep'),
    caption: p('inkCaption'),
    accent: p('accentLight'),
  },
  state: {
    rowHover: p('accentSoft', 'nightRowHover'),
    rowChosen: p('accentChosen', 'nightRowChosen'),
    headerHover: p('hairline', 'nightBorderSoft'),
    track: p('border', 'nightBorder'),
    badgeFill: p('danger'),
    avatarFill: p('muted'),
    skeletonFrom: p('skeletonFrom', 'nightSkeletonFrom'),
    skeletonTo: p('skeletonTo', 'nightSkeletonTo'),
  },
  shadow: {
    float: p('shadowFloat', 'nightShadowFloat'),
  },
} as const;

export type Roles = typeof ROLES;
