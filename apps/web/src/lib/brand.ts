/**
 * Product name and brand colours in one place. The antd theme (`lib/theme.ts`), the shell, the sign-in pages,
 * the printable DPR and progress report all read from here, and `lib/theme.ts` declares each colour as a
 * `--brand-*` CSS variable for the CSS files, so a rebrand is a change to this file, `BrandMark` and `app/icon.svg`.
 */
import { PRODUCT_NAME } from '@erp/shared';

export const BRAND = {
  name: PRODUCT_NAME,
  /** The name as set in the wordmark (condensed capitals). */
  wordmark: 'NIRMAAN',
  description: 'Site progress, billing, purchases, quality and approvals for construction contractors',
  colors: {
    /** Nirmaan blue: antd primary (buttons, checkboxes, tabs, progress bars, the selected menu item). */
    primary: '#1E63D6',
    /** Menu hover on the navy sidebar. */
    primaryDeep: '#17345E',
    /** Blueprint navy: the sidebar, the sign-in page, headings in printed reports. */
    ink: '#0B1F3A',
    inkDeep: '#061328',
    /** Nirmaan blue: the mark, primary buttons, the selected menu item. Text on it is `onAccent`. */
    accent: '#1E63D6',
    accentDeep: '#164FB3',
    /** A lighter blue for text and icons on the navy (the wordmark's surroundings, landing page highlights). */
    accentLight: '#6EA8FF',
    onAccent: '#FFFFFF',
    /** Links: a deeper blue that reads on white. */
    link: '#1A56BF',
    /** Pending and alerts (brick orange, so it never reads as the brand blue). */
    pending: '#C2410C',
    /** Approve and pass buttons, and figures that are good news (a positive margin). Dark enough for white text on it and for text on white (WCAG AA). */
    success: '#167A3E',
    /** Light fills behind success text (status tags): antd's shade of the green above comes out grey. */
    successBg: '#E8F5EC',
    successBorder: '#A7D7B6',
    /** Overdue amounts, losses and other figures that need attention (antd red-7, which reads on white). */
    danger: '#CF1322',
    canvas: '#F3F6FA',
    border: '#DCE3ED',
    /** Field, button and tick box outlines: the brand border a step darker, so a control's edge still shows on white. */
    borderStrong: '#C5CFDC',
    /** Hairlines between table rows, inside cards and under drawer headers. */
    hairline: '#E6EBF2',
    /** Notice fills behind dark text (Alert): the pending orange, the danger red. Info uses `accentSoft`, success `successBg`. */
    pendingBg: '#FDF0E6',
    dangerBg: '#FDECEC',
    /** The dimmed page behind a drawer or dialog: blueprint navy rather than black. */
    scrim: 'rgba(11, 31, 58, 0.45)',
    /** Floating layers (menus, pickers, popovers): a navy-tinted shadow, so depth always means "on top". */
    shadowFloat: '0 8px 24px -6px rgba(11, 31, 58, 0.18), 0 2px 6px -2px rgba(11, 31, 58, 0.10)',
    /** Secondary text on white (subtitles), and quieter captions and footers. */
    muted: '#5B6779',
    /** The quietest text on white that still meets WCAG AA (4.5:1): captions, footers. */
    subtle: '#64748B',
    /** antd's tertiary and placeholder text (descriptions, Typography secondary, empty fields), darkened from 45% and 25% black to meet AA. */
    textTertiary: 'rgba(0, 0, 0, 0.58)',
    textPlaceholder: 'rgba(0, 0, 0, 0.55)',
    /** Section titles on the navy sidebar. */
    inkCaption: 'rgba(255, 255, 255, 0.6)',
    /** A pale blue fill behind a selected chip. */
    accentSoft: '#EEF4FD',
    /** A chosen table row or option: a step deeper than `accentSoft`, so it still shows under the pointer's hover. */
    accentChosen: '#E2ECFB',
    /** Series colours in charts, beside the primary blue (cost heads: expenses, machinery, labour, subcontract). */
    chartViolet: '#7C3AED',
    chartAmber: '#D97706',
    chartTeal: '#0F766E',
    chartPink: '#BE185D',
    /** The management trend's billed, received and cost lines, on white and on the night surface (checked for colour-blind
     *  separation with the dataviz palette check). */
    trendBilled: '#1E63D6',
    trendReceived: '#0D9488',
    trendCost: '#D97706',
    trendBilledNight: '#5B93F0',
    trendReceivedNight: '#14A093',
    trendCostNight: '#D07A1E',
    /** Progress by project (Projects screen): physical and financial progress, on white and on the night surface (the
     *  same checked pair as the trend's billed and received). */
    progressPhysical: '#1E63D6',
    progressFinancial: '#0D9488',
    progressPhysicalNight: '#5B93F0',
    progressFinancialNight: '#14A093',
    /** Drawing markup ink (item 109), on the white of a drawing sheet in either theme. */
    markupRed: '#D92D20',
    markupBlue: '#1E63D6',
    markupGreen: '#167A3E',
    markupOrange: '#C2410C',
    /** Measures and the scale on a drawing (item 118): a violet no mark uses, and the scale's dark slate. */
    takeoff: '#7A3DD8',
    takeoffScale: '#334155',
    /** Comparing revisions: lines only on the older one, only on the newer one, and on both. */
    compareOld: '#D92D20',
    compareNew: '#1E63D6',
    compareBoth: '#9AA3AF',
    /** The website's body text, captions, hairlines and the browser-frame bar on its screenshots. */
    siteText: '#3B4A5F',
    siteMuted: '#64748B',
    siteRule: '#E3E9F1',
    siteFrame: '#F7F9FC',
    /** Module families on tiles (launcher): the icon's colour, the pale fill behind it, and the icon on the night surfaces. */
    familyWork: '#1E63D6',
    familyWorkBg: '#EAF1FC',
    familyWorkNight: '#6EA8FF',
    familyMaterials: '#0F766E',
    familyMaterialsBg: '#E3F3F1',
    familyMaterialsNight: '#4FD1C5',
    familyBuying: '#B45309',
    familyBuyingBg: '#FDF0E1',
    familyBuyingNight: '#F6AD55',
    familyMoney: '#167A3E',
    familyMoneyBg: '#E8F5EC',
    familyMoneyNight: '#5FD08A',
    familyPeople: '#7C3AED',
    familyPeopleBg: '#F1EBFD',
    familyPeopleNight: '#B794F4',
    familyBusiness: '#BE185D',
    familyBusinessBg: '#FCE8F1',
    familyBusinessNight: '#F687B3',
    familyInsight: '#4338CA',
    familyInsightBg: '#ECEBFB',
    familyInsightNight: '#A3A8F5',
    familyAdmin: '#475569',
    familyAdminBg: '#EEF1F5',
    familyAdminNight: '#A0AEC0',
    /** Dark mode surfaces: a near-neutral night with a little of the blueprint navy (page, cards, menus and popups). */
    nightLayout: '#0B1119',
    nightSurface: '#121A25',
    nightElevated: '#18222F',
    nightBorder: '#2B3747',
    nightBorderSoft: '#202B39',
    /** Dark mode text, and links that read on the night surfaces. */
    nightText: '#E3EAF4',
    nightLink: '#6EA8FF',
    /** Dark mode tertiary and placeholder text: nightText at 62% and 58%, which keep 4.5:1 on every night surface. */
    nightTextTertiary: 'rgba(227, 234, 244, 0.62)',
    nightTextPlaceholder: 'rgba(227, 234, 244, 0.58)',
    /** Dark mode danger buttons: a red that reads on the night surfaces as text, with night-ink text when it is the fill. */
    nightDanger: '#F26D6F',
    /** Dark mode notice icons and their fills (the icon colour at 12% on the night surface). */
    nightPending: '#F6AD55',
    nightSuccess: '#5FD08A',
    nightInfoBg: 'rgba(110, 168, 255, 0.12)',
    nightPendingBg: 'rgba(246, 173, 85, 0.12)',
    nightSuccessBg: 'rgba(95, 208, 138, 0.12)',
    nightDangerBg: 'rgba(242, 109, 111, 0.12)',
    /** Dark mode table header, chosen and hovered rows, and the soft blue behind a chosen option. */
    nightAccentSoft: 'rgba(110, 168, 255, 0.10)',
    nightAccentChosen: 'rgba(110, 168, 255, 0.16)',
    /** Dark mode focus ring and the scrim behind a drawer or dialog. */
    nightRing: 'rgba(110, 168, 255, 0.30)',
    nightScrim: 'rgba(2, 6, 12, 0.66)',
    nightShadowFloat: '0 10px 28px -6px rgba(0, 0, 0, 0.55), 0 2px 8px -2px rgba(0, 0, 0, 0.4)',
    /** The fifth tag tone (changes requested, completed, money going out): a violet no other state uses, and its fill. */
    violet: '#6D28D9',
    violetBg: '#F1EBFD',
    nightViolet: '#B794F4',
    /**
     * Dark mode tag fills: each tone's colour at 16% over the night surface, mixed to a solid colour so a tag keeps 4.5:1 on
     * any surface it sits on (an unread row's blue, a popover), and the neutral tone's text.
     */
    nightNeutralText: '#B4BFCD',
    nightNeutralBg: '#29323E',
    nightToneInfoBg: '#213148',
    nightTonePendingBg: '#36322D',
    nightToneSuccessBg: '#1E3735',
    nightToneDangerBg: '#362731',
    nightToneVioletBg: '#2C2E46',
    /** The neutral tag tone's fill in the light theme (its text is `muted`). */
    neutralBg: '#EDF0F4',
    /** The focus ring around a field in the light theme: Nirmaan blue at 18%. */
    ring: 'rgba(30, 99, 214, 0.18)',
    /** Skeleton shimmer, from and to: navy (or night text) at 6% and 12%. */
    skeletonFrom: 'rgba(11, 31, 58, 0.06)',
    skeletonTo: 'rgba(11, 31, 58, 0.12)',
    nightSkeletonFrom: 'rgba(227, 234, 244, 0.06)',
    nightSkeletonTo: 'rgba(227, 234, 244, 0.12)',
  },
} as const;

type Family = 'work' | 'materials' | 'buying' | 'money' | 'people' | 'business' | 'insight' | 'admin';
const cap = (f: Family) => (f[0].toUpperCase() + f.slice(1)) as Capitalize<Family>;

/** A module family's icon colour and fill, for the theme in use (the night fill is the icon colour at 16%). */
export function familyColors(family: Family | undefined, dark: boolean): { fg: string; bg: string } {
  const c = BRAND.colors;
  const k = cap(family ?? 'work');
  if (dark) {
    const fg = c[`family${k}Night`];
    return { fg, bg: `color-mix(in srgb, ${fg} 16%, transparent)` };
  }
  return { fg: c[`family${k}`], bg: c[`family${k}Bg`] };
}

