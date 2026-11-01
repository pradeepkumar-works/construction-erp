'use client';

import { theme, type GlobalToken, type ThemeConfig } from 'antd';
import { token2CSSVar } from '@ant-design/cssinjs';
import { antdTheme } from '@/ds/antd';
import { BRAND } from './brand';

const c = BRAND.colors;

export type { Appearance } from '@/ds/antd';
export { approveTheme, componentConfig } from '@/ds/antd';
export { TYPE_SCALE } from '@/ds/source/scales';
import { FACES } from '@/ds/source/scales';

export const makeTheme = antdTheme;

/** The default look (light, comfortable): the public pages, sign-in, and the app until a user picks otherwise. */
export const appTheme: ThemeConfig = makeTheme({ dark: false, compact: false });

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

export const DISPLAY_FONT = FACES.display;

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
