'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Tabs } from 'antd';
import type { TabsProps } from 'antd';
import { StickyTopContext, useStickyTop } from '@/lib/sticky';
import { useIsPhone } from '@/lib/screen';
import { tk } from '@/ds';

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

/** A count beside a tab's label; list views use it too. */
export function TabCount({ n, label, attention, active }: { n: number; label?: string; attention?: boolean; active: boolean }) {
  // The red is the badge red in either theme (`state.badgeFill`): the night's own red carries white at only 4.2:1.
  const tone = attention
    ? { background: tk.color.state.badgeFill, color: tk.color.text.onAccent }
    : active
      ? { background: tk.color.accent.soft, color: tk.color.accent.text }
      : { background: tk.color.tone.neutral.bg, color: tk.color.text.muted };
  const said = label ? `${n} ${label}` : String(n);
  return (
    <>
      <span
        aria-hidden
        translate="no"
        title={label ? said : undefined}
        style={{
          ...tone,
          ...tk.type.label,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 20,
          height: 20,
          paddingInline: tk.space[1],
          marginInlineStart: tk.space[2],
          borderRadius: tk.radius.pill,
          fontVariantNumeric: 'tabular-nums',
          textShadow: 'none',
          transition: `background ${tk.motion.mid}, color ${tk.motion.mid}`,
        }}
      >
        {n > MAX_SHOWN ? `${MAX_SHOWN}+` : n}
      </span>
      <span className="visually-hidden">, {said}</span>
    </>
  );
}

/**
 * The app's tabs: antd `Tabs` with the look set once in the theme (`Tabs` tokens in `lib/theme.ts`, the indicator in
 * `componentConfig.tabs`), plus what every screen needs and used to build by hand: counts beside labels, buttons beside
 * the bar, the bar's place in a Card, and a bar that stays in view. On a phone the bar scrolls by swipe (globals.css).
 */
export function AppTabs({ items, variant = 'section', extra, sticky = variant === 'page', activeKey, defaultActiveKey, onChange, ...rest }: AppTabsProps) {
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
  // Off a phone the tabs keep their full width and the buttons drop to a line of their own when both do not fit, since
  // antd would otherwise hide tabs behind its overflow button (inside the tablist, which axe refuses).
  const wraps = !!extra && !phone;
  const renderTabBar: TabsProps['renderTabBar'] = (props, DefaultTabBar) => (
    <div
      ref={bar}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tk.space[2],
        marginBottom: page ? 0 : tk.space[3],
        ...(wraps ? { flexWrap: 'wrap' } : {}),
        ...(page && extra ? { paddingInlineEnd: tk.space[3] } : {}),
        ...(sticks ? { position: 'sticky', top, zIndex: 4, background: tk.color.surface.base } : {}),
      }}
    >
      <DefaultTabBar
        {...props}
        style={{
          ...(props.style as React.CSSProperties),
          ...(wraps ? { flex: '1 0 auto', maxWidth: '100%' } : { flex: 1, minWidth: 0 }),
          marginBottom: 0,
          ...(page ? { paddingInline: tk.space[3] } : {}),
        }}
      />
      {wraps ? <div style={{ marginInlineStart: 'auto' }}>{extra}</div> : extra}
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
