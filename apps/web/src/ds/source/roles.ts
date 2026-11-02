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
    linkHover: p('accentDeep', 'accentLight'),
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
    /** A solid colour: what edges and hovers are mixed from, and the background where a gradient cannot go. */
    bg: p('chromeBg', 'nightChromeBg'),
    /** What the rail and the coloured bars paint (a `background`): the bg, or a company's gradient (`ds/chrome.ts`). */
    fill: p('chromeBg', 'nightChromeBg'),
    /** What the chrome's text, lines and fills are drawn in: CSS mixes it at a share over `bg`, so one value turns a dark rail light. */
    ink: p('chromeInk', 'nightChromeInk'),
    deep: p('chromeDeep', 'nightChromeDeep'),
    hover: p('chromeDeep', 'nightChromeDeep'),
    caption: p('chromeCaption', 'nightChromeCaption'),
    accent: p('chromeAccent', 'nightLink'),
  },
  /** What Ask Nirmaan made or read (a drafted form, a reading, an answer): the blue that means AI, kept apart from links. */
  ai: {
    mark: p('accent', 'nightLink'),
    soft: p('accentSoft', 'nightAccentSoft'),
    line: p('accentChosen', 'nightAccentChosen'),
  },
  /** Data drawn by kind, the same name in every chart, bar and legend: canvas charts read them through `useResolved()`. */
  series: {
    /** One colour per cost head (bars, legends, the cost donut). */
    cost: { material: p('primary'), subcontract: p('costSubcontract'), labour: p('costLabour'), machinery: p('costMachinery'), expenses: p('costExpenses') },
    /** The management trend's lines, checked for colour-blind readers on each surface. */
    trend: { billed: p('trendBilled', 'trendBilledNight'), received: p('trendReceived', 'trendReceivedNight'), cost: p('trendCost', 'trendCostNight') },
    /** Progress by project: physical and financial (the trend's billed and received pair). */
    progress: { physical: p('progressPhysical', 'progressPhysicalNight'), financial: p('progressFinancial', 'progressFinancialNight') },
  },
  /** On a drawing sheet, which stays white in either theme: markup inks, take-off and the revision compare. */
  sheet: {
    paper: p('white'),
    /** A drawing's own lines where the file gives none, or gives one too pale for the white sheet. */
    ink: p('black'),
    markup: { red: p('markupRed'), blue: p('markupBlue'), green: p('markupGreen'), orange: p('markupOrange') },
    takeoff: p('takeoff'),
    scale: p('takeoffScale'),
    compare: { old: p('compareOld'), new: p('compareNew'), both: p('compareBoth') },
  },
  /** The primary button: near-black (near-white on the night), the one strong fill on a page. */
  action: {
    solid: p('action', 'nightAction'),
    hover: p('actionHover', 'nightActionHover'),
    text: p('onAction', 'nightOnAction'),
  },
  state: {
    rowHover: p('rowHover', 'nightRowHover'),
    rowChosen: p('accentChosen', 'nightRowChosen'),
    headerHover: p('hairline', 'nightBorderSoft'),
    track: p('border', 'nightBorder'),
    badgeFill: p('danger'),
    /** A count of things waiting (sidebar, top bar, tiles), with `text.onAccent` on it. */
    countFill: p('pending'),
    avatarFill: p('muted'),
    skeletonFrom: p('skeletonFrom', 'nightSkeletonFrom'),
    skeletonTo: p('skeletonTo', 'nightSkeletonTo'),
  },
  shadow: {
    float: p('shadowFloat', 'nightShadowFloat'),
  },
} as const;

export type Roles = typeof ROLES;
