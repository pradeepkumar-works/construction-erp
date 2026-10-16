'use client';

import { theme, type ConfigProviderProps, type GlobalToken, type ThemeConfig } from 'antd';
import { token2CSSVar } from '@ant-design/cssinjs';
import { BRAND } from './brand';

const c = BRAND.colors;

/** The antd theme: brand colours as design tokens and component tokens. Every screen's colours start here. */
export const appTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: c.primary,
    colorInfo: c.primary,
    colorLink: c.link,
    colorLinkHover: c.pending,
    colorBgLayout: c.canvas,
    // Typography type="danger" / "success" and figures coloured from the token read these.
    colorErrorText: c.danger,
    colorSuccessText: c.success,
    borderRadius: 4,
    fontFamily: "var(--font-body), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: c.ink, bodyBg: c.canvas, triggerBg: c.inkDeep, triggerColor: c.accentLight },
    // Primary buttons are Nirmaan blue with white text.
    Button: { colorPrimary: c.accent, colorPrimaryHover: c.accentDeep, colorPrimaryActive: c.accentDeep, primaryColor: c.onAccent, primaryShadow: 'none', fontWeight: 600 },
    Menu: {
      darkItemBg: c.ink,
      darkSubMenuItemBg: c.ink,
      darkItemSelectedBg: c.accent,
      darkItemSelectedColor: c.onAccent,
      darkItemHoverBg: c.primaryDeep,
      darkGroupTitleColor: 'rgba(255,255,255,0.45)',
      itemHeight: 36,
      itemMarginBlock: 2,
      groupTitleFontSize: 11,
      groupTitleLineHeight: 1.2,
    },
    Card: { headerFontSize: 15 },
  },
};

/** The Approve button: a primary button in the success green, with antd's hover and active shades of it. */
const successShades = theme.getDesignToken({ token: { colorPrimary: c.success } });
export const approveTheme: ThemeConfig = {
  components: { Button: { colorPrimary: c.success, colorPrimaryHover: successShades.colorPrimaryHover, colorPrimaryActive: successShades.colorPrimaryActive } },
};

/** Figures line up in tables and statistics. */
const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;

/** Defaults for every instance of a component, passed to the root ConfigProvider with the theme. */
export const componentConfig: Pick<ConfigProviderProps, 'table' | 'statistic'> = {
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

const kebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * antd scopes its CSS variables to each component, so plain elements (the sign-in page, the website, the
 * sidebar) cannot read them. This declares the theme's colour tokens on :root under antd's own names
 * (`--ant-color-text-tertiary`), plus the brand palette as `--brand-*`, so CSS files never hold a colour.
 */
export const themeCssVariables = (() => {
  const token = theme.getDesignToken(appTheme);
  const vars: string[] = [];
  for (const [key, value] of Object.entries(token)) {
    if (COLOR_TOKEN.test(key) && typeof value === 'string') vars.push(`${token2CSSVar(key, 'ant')}:${value}`);
  }
  for (const [key, value] of Object.entries(c)) vars.push(`--brand-${kebab(key)}:${value}`);
  return `:root{${vars.join(';')}}`;
})();
