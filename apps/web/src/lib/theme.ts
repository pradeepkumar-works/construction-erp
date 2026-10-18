'use client';

import { theme, type ConfigProviderProps, type GlobalToken, type ThemeConfig } from 'antd';
import { token2CSSVar } from '@ant-design/cssinjs';
import { BRAND } from './brand';

const c = BRAND.colors;

/** How the signed-in app looks: light or dark, comfortable or compact (each user picks, see `lib/appearance.tsx`). */
export interface Appearance {
  dark: boolean;
  compact: boolean;
}

/** The one type scale (UX item 82), in px: 12 is the floor, in either density. */
export const TYPE_SCALE = [12, 14, 16, 20, 24, 30] as const;

/** antd's line height for a font size (its `getLineHeight`): the text plus 8 px. */
const lineHeightOf = (size: number) => (size + 8) / size;

/**
 * The type and target floor, run after antd's own algorithms (UX item 82). antd's compact algorithm rebuilds every font
 * size from 12 (body 12, small 10) and makes small controls 21 px; this puts the type back on the scale (12 small, 14 body,
 * 16 large, 20 extra large; headings 30, 24, 20, 16, 14) so compact shrinks only heights and spacing, and keeps a small
 * control 24 px (WCAG 2.5.8) and the extra small one 16 px.
 */
const typeAndTargets: typeof theme.compactAlgorithm = (seed, map) => {
  const base = map ?? theme.defaultAlgorithm(seed);
  const [sm, md, lg, xl, h2, h1] = TYPE_SCALE;
  const headings = [h1, h2, xl, lg, md] as const;
  return {
    ...base,
    fontSizeSM: sm,
    fontSize: md,
    fontSizeLG: lg,
    fontSizeXL: xl,
    fontSizeHeading1: headings[0],
    fontSizeHeading2: headings[1],
    fontSizeHeading3: headings[2],
    fontSizeHeading4: headings[3],
    fontSizeHeading5: headings[4],
    lineHeightSM: lineHeightOf(sm),
    lineHeight: lineHeightOf(md),
    lineHeightLG: lineHeightOf(lg),
    lineHeightHeading1: lineHeightOf(headings[0]),
    lineHeightHeading2: lineHeightOf(headings[1]),
    lineHeightHeading3: lineHeightOf(headings[2]),
    lineHeightHeading4: lineHeightOf(headings[3]),
    lineHeightHeading5: lineHeightOf(headings[4]),
    fontHeightSM: sm + 8,
    fontHeight: md + 8,
    fontHeightLG: lg + 8,
    controlHeightSM: Math.max(base.controlHeightSM, 24),
    controlHeightXS: Math.max(base.controlHeightXS, 16),
  };
};

/** The antd theme for one appearance: brand colours as design tokens and component tokens. Every screen's colours start here. */
export function makeTheme({ dark, compact }: Appearance): ThemeConfig {
  const algorithm = [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, ...(compact ? [theme.compactAlgorithm] : []), typeAndTargets];
  const token: ThemeConfig['token'] = {
    colorPrimary: c.primary,
    colorInfo: c.primary,
    borderRadius: 6,
    fontFamily: "var(--font-body), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    ...(dark
      ? // A slightly navy night rather than antd's black, so dark mode still reads as Nirmaan.
        {
          colorTextBase: c.nightText,
          colorBgLayout: c.nightLayout,
          colorBgContainer: c.nightSurface,
          colorBgElevated: c.nightElevated,
          colorBorder: c.nightBorder,
          colorBorderSecondary: c.nightBorderSoft,
          colorLink: c.nightLink,
          colorLinkHover: c.accentLight,
          // The same AA fixes as the light theme, on the night surfaces: brighter quiet text and a primary text blue that
          // reads on navy (the badge red is set on Badge alone, since red text needs the lighter shade here).
          colorTextTertiary: c.nightTextTertiary,
          colorTextDescription: c.nightTextTertiary,
          colorTextPlaceholder: c.nightTextPlaceholder,
          colorPrimaryText: c.nightLink,
          // Typography type="danger" and red figures: antd's dark red falls under 4.5:1 on the night surfaces.
          colorErrorText: c.nightDanger,
        }
      : {
          colorLink: c.link,
          colorLinkHover: c.pending,
          colorBgLayout: c.canvas,
          // Typography type="danger" / "success" and figures coloured from the token read these.
          colorErrorText: c.danger,
          colorSuccessText: c.success,
          colorWarningText: c.pending,
          // Badges, danger buttons and success fills carry white or coloured text, so they use the AA-safe shades.
          colorError: c.danger,
          colorSuccess: c.success,
          colorSuccessBg: c.successBg,
          colorSuccessBorder: c.successBorder,
          // antd's 45% and 25% black fall below WCAG AA (4.5:1) on white and on the canvas.
          colorTextTertiary: c.textTertiary,
          colorTextDescription: c.textTertiary,
          colorTextPlaceholder: c.textPlaceholder,
        }),
  };
  // The header is a card-coloured bar in either mode.
  const surface = theme.getDesignToken({ algorithm, token }).colorBgContainer;
  return {
    // Every token is set here, so nothing carries over from the light theme above the signed-in app.
    inherit: false,
    algorithm,
    token,
    components: {
      Layout: { headerBg: surface, siderBg: c.ink, bodyBg: dark ? undefined : c.canvas, triggerBg: c.inkDeep, triggerColor: c.accentLight },
      // Primary buttons are Nirmaan blue with white text.
      Button: {
        colorPrimary: c.accent,
        colorPrimaryHover: c.accentDeep,
        colorPrimaryActive: c.accentDeep,
        primaryColor: c.onAccent,
        primaryShadow: 'none',
        fontWeight: 600,
        // Reject and Delete stay readable on the night surfaces (WCAG AA).
        ...(dark ? { colorError: c.nightDanger, dangerColor: c.nightLayout } : {}),
      },
      Menu: {
        darkItemBg: c.ink,
        darkSubMenuItemBg: c.ink,
        darkItemSelectedBg: c.accent,
        darkItemSelectedColor: c.onAccent,
        darkItemHoverBg: c.primaryDeep,
        darkGroupTitleColor: c.inkCaption,
        itemHeight: 36,
        itemMarginBlock: 2,
        groupTitleFontSize: TYPE_SCALE[0],
        groupTitleLineHeight: 1.2,
      },
      // A small Segmented (the project page's tabs) draws its items 4 px inside the control: 28 keeps each item 24 px.
      Segmented: { controlHeightSM: 28 },
      // Figures and dialog titles keep their size now that the headings follow the scale (antd reads heading 3 and 5).
      Statistic: { contentFontSize: TYPE_SCALE[4] },
      Modal: { titleFontSize: TYPE_SCALE[2] },
      // Initials avatars: antd fills them with the placeholder grey, which white initials fail AA on in dark mode.
      Avatar: { colorTextPlaceholder: c.muted },
      // The selected tab's text is primary-coloured, which in dark mode needs the lighter blue to read.
      ...(dark ? { Badge: { colorError: c.danger }, Tabs: { itemSelectedColor: c.nightLink, itemActiveColor: c.nightLink, itemHoverColor: c.accentLight, inkBarColor: c.nightLink } } : {}),
    },
  };
}

/** The default look (light, comfortable): the public pages, sign-in, and the app until a user picks otherwise. */
export const appTheme: ThemeConfig = makeTheme({ dark: false, compact: false });

/** The Approve button: a primary button in the success green, with antd's hover and active shades of it. */
const successShades = theme.getDesignToken({ token: { colorPrimary: c.success } });
export const approveTheme: ThemeConfig = {
  components: { Button: { colorPrimary: c.success, colorPrimaryHover: successShades.colorPrimaryHover, colorPrimaryActive: successShades.colorPrimaryActive } },
};

/** Figures line up in tables and statistics. */
const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;

/** Defaults for every instance of a component, passed to the root ConfigProvider with the theme. */
export const componentConfig: Pick<ConfigProviderProps, 'table' | 'statistic' | 'form'> = {
  // A field left empty says which one, so the error reads on its own (and in the form's summary).
  form: { validateMessages: { required: '${label} is required', types: { email: 'Enter an email address, e.g. name@company.com', number: '${label} must be a number' } } },
  table: { styles: { title: tabularNums, section: tabularNums, footer: tabularNums, header: { cell: { whiteSpace: 'nowrap' } } } },
  statistic: { styles: { content: tabularNums } },
};

/** Colour tokens: the semantic ones (`colorErrorText`) and antd's preset palettes (`orange7`). */
const COLOR_TOKEN = /^(color[A-Z]|(blue|purple|cyan|green|magenta|pink|red|orange|yellow|volcano|geekblue|gold|lime)\d+$)/;

/**
 * A theme colour for an inline style or a constant outside a component, as the token's CSS variable, so
 * it follows the theme like `theme.useToken()` would: `color: themeColor('colorErrorText')`.
 */
export const themeColor = (key: keyof GlobalToken) => `var(${token2CSSVar(key, 'ant')})`;

const FONT_SIZE_KEYS = ['fontSizeSM', 'fontSize', 'fontSizeLG', 'fontSizeXL', 'fontSizeHeading1', 'fontSizeHeading2', 'fontSizeHeading3', 'fontSizeHeading4', 'fontSizeHeading5'] as const;
type FontSizeKey = (typeof FONT_SIZE_KEYS)[number];

/**
 * A size from the type scale for an inline style outside a component (a constant, a column definition), as the token's
 * CSS variable, so it follows the theme like `token.fontSizeSM` would: `fontSize: themeFontSize('fontSizeSM')`.
 */
export const themeFontSize = (key: FontSizeKey) => `var(${token2CSSVar(key, 'ant')})`;

const SPACING_KEYS = ['paddingXXS', 'paddingXS', 'paddingSM', 'padding', 'paddingLG', 'marginXXS', 'marginXS', 'marginSM', 'margin', 'marginLG', 'lineWidth', 'borderRadius', 'borderRadiusLG'] as const;

const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * antd scopes its CSS variables to each component, so plain elements (the sign-in page, the website, the
 * sidebar) cannot read them. This declares a theme's colour tokens on :root under antd's own names
 * (`--ant-color-text-tertiary`), its type scale, spacing and motion tokens, plus the brand palette as `--brand-*`, so CSS files never hold a
 * colour or a duration.
 */
export function cssVariablesFor(config: ThemeConfig): string {
  const token = theme.getDesignToken(config);
  const vars: string[] = [];
  for (const [key, value] of Object.entries(token)) {
    if (COLOR_TOKEN.test(key) && typeof value === 'string') vars.push(`${token2CSSVar(key, 'ant')}:${value}`);
  }
  for (const [key, value] of Object.entries(c)) vars.push(`--brand-${kebab(key)}:${value}`);
  vars.push(`--ant-control-height:${token.controlHeight}px`);
  // The type scale, so CSS files and inline styles outside a component (`var(--ant-font-size-sm)`) never hold a px size.
  for (const key of FONT_SIZE_KEYS) {
    vars.push(`${token2CSSVar(key, 'ant')}:${token[key]}px`);
  }
  // Spacing, line and corner sizes, so CSS for plain elements (a list's cards on a phone) keeps antd's rhythm and density.
  for (const key of SPACING_KEYS) vars.push(`${token2CSSVar(key, 'ant')}:${token[key]}px`);
  vars.push(`--ant-font-weight-strong:${token.fontWeightStrong}`);
  vars.push(`--ant-control-item-bg-active:${token.controlItemBgActive}`);
  // antd's own motion, so CSS transitions (the sidebar) move at the same pace as antd's components.
  for (const key of ['motionDurationFast', 'motionDurationMid', 'motionDurationSlow', 'motionEaseInOut', 'motionEaseOut'] as const) vars.push(`${token2CSSVar(key, 'ant')}:${token[key]}`);
  return `:root{${vars.join(';')}}`;
}

export const themeCssVariables = cssVariablesFor(appTheme);
