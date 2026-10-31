'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Flex, Segmented, Tabs, Typography, theme } from 'antd';
import { AppstoreOutlined, CheckSquareOutlined, InboxOutlined, ScheduleOutlined, ToolOutlined, WalletOutlined } from '@/components/common/icons';
import { readPref, writePref } from '@/lib/prefs';
import { StickyTopContext, useStickyTop } from '@/lib/sticky';

/** The project page's groups: six at the top, the old tabs as a second level inside. */
export const WORKSPACE_GROUPS = [
  { key: 'overview', label: 'Overview', icon: <AppstoreOutlined aria-hidden /> },
  { key: 'plan', label: 'Plan', icon: <ScheduleOutlined aria-hidden /> },
  { key: 'site', label: 'Site', icon: <ToolOutlined aria-hidden /> },
  { key: 'materials', label: 'Materials', icon: <InboxOutlined aria-hidden /> },
  { key: 'money', label: 'Money', icon: <WalletOutlined aria-hidden /> },
  { key: 'handover', label: 'Handover', icon: <CheckSquareOutlined aria-hidden /> },
] as const;
export type WorkspaceGroup = (typeof WORKSPACE_GROUPS)[number]['key'];

/** One tab of the project page. `key` is what `?tab=` holds, the same as before the groups, so old links still work. */
export interface WorkspaceTab {
  key: string;
  label: string;
  group: WorkspaceGroup;
  children: React.ReactNode;
}

const lastInGroupKey = (group: WorkspaceGroup) => `nirmaan.project.group.${group}`;

/**
 * The tabs of a project, grouped: a sticky bar with the groups and, below them, the tabs of the open group. When the
 * page header has scrolled away the bar shows the project's name (`compactTitle`) so the page still says where you are.
 * Tables inside know how tall the bar is and stick their headers under it.
 */
export function ProjectWorkspace({
  tabs,
  active,
  onChange,
  compactTitle,
  headerRef,
}: {
  tabs: WorkspaceTab[];
  active: string;
  onChange: (key: string) => void;
  compactTitle: React.ReactNode;
  /** The page header; when it is out of view the bar shows `compactTitle`. */
  headerRef: React.RefObject<HTMLElement | null>;
}) {
  const { token } = theme.useToken();
  const barRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ height: 0, width: 0 });
  const headerTop = useStickyTop();
  const [collapsed, setCollapsed] = useState(false);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const groups = WORKSPACE_GROUPS.filter((g) => tabs.some((t) => t.group === g.key));
  const inGroup = tabs.filter((t) => t.group === current.group);

  useEffect(() => writePref(lastInGroupKey(current.group), current.key), [current.group, current.key]);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setBar({ height: el.offsetHeight, width: el.offsetWidth });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { rootMargin: `-${headerTop}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [headerRef, headerTop]);

  const openGroup = (group: string) => {
    const remembered = readPref<string | null>(lastInGroupKey(group as WorkspaceGroup), null);
    const target = tabs.find((t) => t.group === group && t.key === remembered) ?? tabs.find((t) => t.group === group);
    if (target) onChange(target.key);
  };

  return (
    <StickyTopContext.Provider value={headerTop + bar.height}>
      <div
        ref={barRef}
        data-testid="project-workspace-bar"
        style={{
          position: 'sticky',
          top: headerTop,
          zIndex: 5,
          background: token.colorBgContainer,
          borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
          borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 0 0`,
          padding: `0 ${token.paddingSM}px`,
        }}
      >
        {/* The compact title sits beside the tabs, not in antd's tab bar, whose role="tablist" may hold only tabs. */}
        <Flex align="center" style={{ borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}>
          {collapsed ? (
            <Flex align="center" gap={token.marginXS} style={{ marginRight: token.marginLG, maxWidth: Math.min(420, Math.max(180, bar.width * 0.3)), minWidth: 0 }}>
              {compactTitle}
            </Flex>
          ) : null}
          <Tabs activeKey={current.group} onChange={openGroup} items={groups.map((g) => ({ key: g.key, label: g.label, icon: g.icon }))} tabBarStyle={{ marginBottom: -token.lineWidth }} style={{ flex: 1, minWidth: 0 }} />
        </Flex>
        {inGroup.length > 1 && (
          <div style={{ padding: `${token.paddingXS}px 0`, overflowX: 'auto' }}>
            <Segmented size="small" value={current.key} onChange={(v) => onChange(String(v))} options={inGroup.map((t) => ({ value: t.key, label: t.label }))} aria-label={`${groups.find((g) => g.key === current.group)?.label} tabs`} />
          </div>
        )}
      </div>
      <div role="tabpanel" aria-label={current.label} style={{ paddingTop: token.paddingSM }}>
        {current.children}
      </div>
    </StickyTopContext.Provider>
  );
}

/** The title in the collapsed bar: code, name (cut to fit) and whatever follows (status, health). */
export function CompactTitle({ code, name, children }: { code: string; name: string; children?: React.ReactNode }) {
  return (
    <>
      <Typography.Text strong className="mono" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
        {code}
      </Typography.Text>
      <Typography.Text ellipsis={{ tooltip: name }} style={{ minWidth: 0 }}>
        {name}
      </Typography.Text>
      {children}
    </>
  );
}
