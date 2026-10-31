'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Tabs, theme } from 'antd';
import type { TabsProps } from 'antd';
import { StickyTopContext, useStickyTop } from '@/lib/sticky';
import { useIsPhone } from '@/lib/screen';
import { BRAND } from '@/lib/brand';

type AntTab = NonNullable<TabsProps['items']>[number];

export interface AppTab extends AntTab {
  /** A figure beside the label. Shown when it is a number; an `attention` count of 0 is left out (nothing waits). */
  count?: number | null;
  /** What the count is, read after it by a screen reader and shown on hover: "waiting for QA/QC". Say it as a plural. */
  countLabel?: string;
  /** The count is work waiting on someone (filled red), not just how many there are (quiet grey). */
  attention?: boolean;
}

export interface AppTabsProps extends Omit<TabsProps, 'items' | 'tabBarExtraContent' | 'renderTabBar' | 'tabBarStyle' | 'type'> {
  items: AppTab[];
  /**
   * `page`: the page's own tabs, at the top of its Card: the bar lines up with the card's padding, sits on a hairline with
   * no gap under it, and stays below the app header while the panel scrolls. `section` (the default): tabs inside a
   * page, a drawer or another tab, with the usual space under the bar.
   */
  variant?: 'page' | 'section';
  /** Buttons beside the bar (Excel, New), outside its tablist, which may hold only tabs (WCAG). */
  extra?: React.ReactNode;
  /** Keep the bar in view while the panel scrolls; `page` tabs do by default. Never on a phone, where the screen is short. */
  sticky?: boolean;
}

const MAX_SHOWN = 99;

/** The visually hidden text after a count, so a screen reader says "Tests, 3 results overdue" rather than "Tests3". */
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

function TabCount({ n, label, attention, active }: { n: number; label?: string; attention?: boolean; active: boolean }) {
  const { token } = theme.useToken();
  // The red is the badge red in either theme (as `Badge` in lib/theme.ts): antd's night red carries white at only 4.2:1.
  const tone = attention
    ? { background: BRAND.colors.danger, color: BRAND.colors.onAccent }
    : active
      ? { background: token.colorPrimaryBg, color: token.colorPrimaryText }
      : { background: token.colorFillSecondary, color: token.colorTextSecondary };
  const said = label ? `${n} ${label}` : String(n);
  return (
    <>
      <span
        aria-hidden
        translate="no"
        title={label ? said : undefined}
        style={{
          ...tone,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 20,
          height: 20,
          padding: `0 ${token.paddingXS - 2}px`,
          marginInlineStart: token.marginXS,
          borderRadius: 10,
          fontSize: token.fontSizeSM,
          lineHeight: 1,
          fontWeight: token.fontWeightStrong,
          fontVariantNumeric: 'tabular-nums',
          textShadow: 'none',
          transition: `background ${token.motionDurationMid}, color ${token.motionDurationMid}`,
        }}
      >
        {n > MAX_SHOWN ? `${MAX_SHOWN}+` : n}
      </span>
      <span style={srOnly}>, {said}</span>
    </>
  );
}

/**
 * The app's tabs: antd `Tabs` with the look set once in the theme (`Tabs` tokens in `lib/theme.ts`, the indicator in
 * `componentConfig.tabs`), plus what every screen needs and used to build by hand: counts beside labels, buttons beside
 * the bar, the bar's place in a Card, and a bar that stays in view. On a phone the bar scrolls by swipe (globals.css).
 */
export function AppTabs({ items, variant = 'section', extra, sticky = variant === 'page', activeKey, defaultActiveKey, onChange, ...rest }: AppTabsProps) {
  const { token } = theme.useToken();
  const top = useStickyTop();
  const phone = useIsPhone();
  const sticks = sticky && !phone;
  const [own, setOwn] = useState(defaultActiveKey ?? items[0]?.key);
  // Uncontrolled, the first tab stands in when the one picked is gone (a tab that only some users or data have).
  const active = activeKey ?? (items.some((t) => t.key === own) ? own : items[0]?.key);
  const bar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!sticks || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    setBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [sticks]);

  const tabs: AntTab[] = items.map(({ count, countLabel, attention, label, ...tab }) => {
    const shown = typeof count === 'number' && !(attention && count === 0);
    return {
      ...tab,
      label: shown ? (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {label}
          <TabCount n={count} label={countLabel} attention={attention} active={tab.key === active} />
        </span>
      ) : (
        label
      ),
    };
  });

  const page = variant === 'page';
  // A page's bar runs to the card's edges (its hairline too), with the tabs and buttons in line with the card's padding.
  // One wrapper only: antd styles the bar as `.ant-tabs > .ant-tabs-nav` or `.ant-tabs > div > .ant-tabs-nav`.
  const renderTabBar: TabsProps['renderTabBar'] = (props, DefaultTabBar) => (
    <div
      ref={bar}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: token.marginXS,
        marginBottom: page ? 0 : token.marginSM,
        ...(page && extra ? { paddingInlineEnd: token.paddingSM } : {}),
        ...(sticks ? { position: 'sticky', top, zIndex: 4, background: token.colorBgContainer } : {}),
      }}
    >
      <DefaultTabBar {...props} style={{ ...(props.style as React.CSSProperties), flex: 1, minWidth: 0, marginBottom: 0, ...(page ? { paddingInline: token.paddingSM } : {}) }} />
      {extra}
    </div>
  );

  const tabsEl = (
    <Tabs
      {...rest}
      items={tabs}
      activeKey={active}
      onChange={(k) => {
        if (activeKey === undefined) setOwn(k);
        onChange?.(k);
      }}
      renderTabBar={renderTabBar}
    />
  );
  // Always the same tree, so the panels keep their state when the window crosses the phone width.
  return <StickyTopContext.Provider value={sticks ? top + barHeight : top}>{tabsEl}</StickyTopContext.Provider>;
}
