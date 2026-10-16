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

/** The antd theme for one appearance: brand colours as design tokens and component tokens. Every screen's colours start here. */
export function makeTheme({ dark, compact }: Appearance): ThemeConfig {
  const algorithm = [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, ...(compact ? [theme.compactAlgorithm] : [])];
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
        }
      : {
          colorLink: c.link,
          colorLinkHover: c.pending,
          colorBgLayout: c.canvas,
          // Typography type="danger" / "success" and figures coloured from the token read these.
          colorErrorText: c.danger,
          colorSuccessText: c.success,
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
 * sidebar) cannot read them. This declares a theme's colour tokens on :root under antd's own names
 * (`--ant-color-text-tertiary`), plus the brand palette as `--brand-*`, so CSS files never hold a colour.
 */
export function cssVariablesFor(config: ThemeConfig): string {
  const token = theme.getDesignToken(config);
  const vars: string[] = [];
  for (const [key, value] of Object.entries(token)) {
    if (COLOR_TOKEN.test(key) && typeof value === 'string') vars.push(`${token2CSSVar(key, 'ant')}:${value}`);
  }
  for (const [key, value] of Object.entries(c)) vars.push(`--brand-${kebab(key)}:${value}`);
  vars.push(`--ant-control-height:${token.controlHeight}px`);
  return `:root{${vars.join(';')}}`;
}

export const themeCssVariables = cssVariablesFor(appTheme);
