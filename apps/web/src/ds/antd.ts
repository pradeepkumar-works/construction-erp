'use client';

import { theme, type ConfigProviderProps, type ThemeConfig } from 'antd';
import { lineHeightOf, resolve, type Resolved } from './engine';
import { FACES, TYPE, TYPE_SCALE, lineHeightPx, type Density } from './source/scales';

export interface Appearance {
  dark: boolean;
  compact: boolean;
}

/**
 * The last antd algorithm: puts antd's type back on our scale (antd's compact algorithm rebuilds every size from 12) and
 * keeps the small and extra small controls at 24 and 16 px (WCAG 2.5.8), so compact shrinks only heights and spacing.
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
    fontHeightSM: lineHeightPx(sm),
    fontHeight: lineHeightPx(md),
    fontHeightLG: lineHeightPx(lg),
    controlHeightSM: Math.max(base.controlHeightSM, 24),
    controlHeightXS: Math.max(base.controlHeightXS, 16),
  };
};

function seedTokens(r: Resolved): ThemeConfig['token'] {
  const { surface, text, line, accent, tone, shadow } = r.color;
  return {
    colorPrimary: accent.solid,
    colorInfo: accent.solid,
    borderRadius: r.radius.md,
    fontFamily: FACES.body,
    colorBgMask: surface.scrim,
    boxShadowSecondary: shadow.float,
    colorTextBase: text.strong,
    colorBgLayout: surface.canvas,
    colorBgContainer: surface.base,
    colorBgElevated: surface.raised,
    colorBorder: line.base,
    colorBorderSecondary: line.hairline,
    colorLink: text.link,
    colorLinkHover: text.linkHover,
    colorTextTertiary: text.faint,
    colorTextDescription: text.faint,
    colorTextPlaceholder: text.placeholder,
    colorErrorText: tone.danger.fg,
    ...(r.mode === 'dark'
      ? // antd's dark algorithm derives the rest; these keep its primary text and danger text AA on the night surfaces.
        { colorPrimaryText: text.link }
      : {
          colorSuccessText: tone.success.fg,
          colorWarningText: tone.pending.fg,
          colorError: tone.danger.solid,
          colorSuccess: tone.success.solid,
          colorSuccessBg: tone.success.bg,
          colorSuccessBorder: tone.success.line,
        }),
  };
}

function components(r: Resolved, base: ReturnType<typeof theme.getDesignToken>): ThemeConfig['components'] {
  const { surface, text, line, accent, tone, chrome, state, action } = r.color;
  const dark = r.mode === 'dark';
  return {
    Layout: { headerBg: base.colorBgContainer, siderBg: chrome.bg, bodyBg: dark ? undefined : surface.canvas, triggerBg: chrome.deep, triggerColor: chrome.accent },
    // The Quiet look: the primary button is near-black (near-white on the night); a default button stays neutral under the
    // pointer, a step of grey rather than blue, so blue keeps its meanings (focus, links, chosen, data, AI).
    Button: {
      colorPrimary: action.solid,
      colorPrimaryHover: action.hover,
      colorPrimaryActive: action.hover,
      primaryColor: action.text,
      primaryShadow: 'none',
      fontWeight: 500,
      defaultShadow: 'none',
      defaultHoverBg: state.rowHover,
      defaultHoverColor: text.strong,
      defaultHoverBorderColor: line.base,
      defaultActiveBg: line.hairline,
      defaultActiveColor: text.strong,
      defaultActiveBorderColor: line.base,
      ...(dark ? { colorError: tone.danger.solid, dangerColor: surface.canvas } : {}),
    },
    Menu: {
      darkItemBg: chrome.bg,
      darkSubMenuItemBg: chrome.bg,
      darkItemSelectedBg: accent.solid,
      darkItemSelectedColor: text.onAccent,
      darkItemHoverBg: chrome.hover,
      darkGroupTitleColor: chrome.caption,
      itemHeight: 36,
      itemMarginBlock: 2,
      groupTitleFontSize: TYPE.caption.size,
      groupTitleLineHeight: 1.2,
    },
    Segmented: { controlHeightSM: 28 },
    Statistic: { contentFontSize: TYPE.heading.size },
    Modal: { titleFontSize: TYPE.lead.size },
    // Initials avatars: antd fills them with the placeholder grey, which white initials fail AA on in dark mode.
    Avatar: { colorTextPlaceholder: state.avatarFill },
    Tabs: {
      itemColor: base.colorTextSecondary,
      itemSelectedColor: accent.text,
      itemHoverColor: dark ? chrome.accent : accent.solid,
      itemActiveColor: dark ? accent.text : accent.hover,
      inkBarColor: line.focus,
      lineWidthBold: 3,
      horizontalItemGutter: base.marginLG,
      horizontalItemPadding: `${Math.max(base.paddingSM - 2, 6)}px 0`,
      horizontalItemPaddingSM: `${Math.max(base.paddingXS - 2, 4)}px 0`,
      horizontalItemPaddingLG: `${base.paddingSM + 2}px 0`,
      horizontalMargin: `0 0 ${base.marginSM}px 0`,
      titleFontSizeSM: TYPE.body.size,
    },
    Input: { activeBorderColor: line.focus, activeShadow: `0 0 0 3px ${line.ring}` },
    InputNumber: { activeBorderColor: line.focus, activeShadow: `0 0 0 3px ${line.ring}` },
    Mentions: { activeBorderColor: line.focus, activeShadow: `0 0 0 3px ${line.ring}` },
    DatePicker: { activeBorderColor: line.focus, activeShadow: `0 0 0 3px ${line.ring}`, cellActiveWithRangeBg: accent.soft },
    Select: { activeBorderColor: line.focus, activeOutlineColor: line.ring, optionSelectedBg: accent.chosen, optionSelectedFontWeight: 600, optionSelectedColor: base.colorText },
    Table: {
      headerBg: surface.sunken,
      headerColor: base.colorTextSecondary,
      headerSplitColor: 'transparent',
      headerSortActiveBg: surface.sunken,
      headerSortHoverBg: state.headerHover,
      fixedHeaderSortActiveBg: surface.sunken,
      bodySortBg: 'transparent',
      rowHoverBg: state.rowHover,
      rowSelectedBg: state.rowChosen,
      rowSelectedHoverBg: state.rowChosen,
      footerBg: surface.sunken,
    },
    Card: { headerHeight: 52, headerHeightSM: 40 },
    Alert: {
      defaultPadding: `${base.paddingSM - 2}px ${base.paddingSM + 2}px`,
      withDescriptionPadding: `${base.paddingSM + 2}px ${base.padding}px`,
      colorInfo: tone.info.solid,
      colorInfoBg: tone.info.notice,
      colorInfoBorder: 'transparent',
      colorWarning: tone.pending.solid,
      colorWarningBg: tone.pending.notice,
      colorWarningBorder: 'transparent',
      colorSuccess: tone.success.solid,
      colorSuccessBg: tone.success.notice,
      colorSuccessBorder: 'transparent',
      colorError: tone.danger.solid,
      colorErrorBg: tone.danger.notice,
      colorErrorBorder: 'transparent',
    },
    Descriptions: { labelColor: base.colorTextSecondary, labelBg: surface.sunken },
    Tooltip: { colorBgSpotlight: surface.inverse },
    Progress: { remainingColor: state.track, lineBorderRadius: 2, colorSuccess: tone.success.solid },
    Skeleton: { gradientFromColor: state.skeletonFrom, gradientToColor: state.skeletonTo },
    ...(dark ? { Badge: { colorError: state.badgeFill } } : {}),
  };
}

const configs = new Map<string, ThemeConfig>();

export function antdTheme({ dark, compact }: Appearance): ThemeConfig {
  const key = `${dark}-${compact}`;
  const hit = configs.get(key);
  if (hit) return hit;
  const density: Density = compact ? 'compact' : 'comfortable';
  const r = resolve(dark ? 'dark' : 'light', density);
  const algorithm = [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, ...(compact ? [theme.compactAlgorithm] : []), typeAndTargets];
  const token = seedTokens(r);
  const base = theme.getDesignToken({ algorithm, token });
  const config: ThemeConfig = { inherit: false, algorithm, token, components: components(r, base) };
  configs.set(key, config);
  return config;
}

const success = resolve('light').color.tone.success.solid;
const onSuccess = resolve('light').color.text.onAccent;
const successShades = theme.getDesignToken({ token: { colorPrimary: success } });
/** The green Approve button: white on the green in both themes (the primary button's own text is near-white on the night). */
export const approveTheme: ThemeConfig = {
  components: { Button: { colorPrimary: success, colorPrimaryHover: successShades.colorPrimaryHover, colorPrimaryActive: successShades.colorPrimaryActive, primaryColor: onSuccess } },
};

const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const;
const titleStyle = { fontFamily: FACES[TYPE.title.face], fontWeight: TYPE.title.weight, letterSpacing: TYPE.title.track } as const;
const figureStyle = { fontFamily: FACES[TYPE.figure.face], fontWeight: TYPE.figure.weight, letterSpacing: TYPE.figure.track } as const;

export const componentConfig: Pick<ConfigProviderProps, 'table' | 'statistic' | 'form' | 'tabs' | 'card' | 'modal' | 'drawer'> = {
  form: { validateMessages: { required: 'Enter the ${label}', types: { email: 'Enter an email address, e.g. name@company.com', number: '${label} must be a number' } } },
  table: { styles: { title: tabularNums, section: tabularNums, footer: tabularNums, header: { cell: { whiteSpace: 'nowrap', fontSize: 'var(--ant-font-size-sm)', fontWeight: 500 } } } },
  statistic: { styles: { content: { ...tabularNums, ...figureStyle } } },
  card: { styles: { title: titleStyle } },
  modal: { styles: { title: titleStyle } },
  drawer: { styles: { title: titleStyle, footer: { background: 'var(--ant-color-bg-layout)' } } },
  tabs: { styles: { indicator: { borderRadius: '3px 3px 0 0' } } },
};
