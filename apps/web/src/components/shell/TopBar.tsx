'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import { DownOutlined, MenuOutlined } from '@/components/common/icons';
import type { AuthUser, NavLook, NavMenuModule, NavMenuSub, NavNode } from '@erp/shared';
import { canSeeNav, mayApprove, moduleScreenHref, navDestination, navNode, projectTabHref } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { ProjectPick } from '@/components/launcher/TileGrid';
import { BrandMark, Wordmark } from './BrandMark';
import { ProjectSwitcher } from './ProjectSwitcher';
import { CompanyName, CompanySwitcher } from './CompanySwitcher';
import { TreeIcon } from './nav-icons';
import type { MenuPlace } from './menu';
import s from './TopBar.module.css';

const LOOK_CLASS = { NAVY: s.lookNavy, FRAME: s.lookFrame, BAR: s.lookBar } as const;
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** How tall the top of the page is in each look, for anything sticky below it (`useStickyTop`). */
export function topBarHeight(look: NavLook, mobile: boolean, withModule: boolean): number {
  if (look === 'BAR' && !mobile) return 60;
  return 56 + (withModule ? (mobile ? 44 : 48) : 0);
}

/** Where a node goes from the menu: its page, its tab of the header's project, or nowhere yet (no project chosen). */
function hrefOf(node: NavNode, projectId: string | undefined): string | null {
  const to = navDestination(node);
  if (!to) return null;
  if (to.kind === 'page') return to.href;
  return projectId ? projectTabHref(projectId, to.tab, to.query) : null;
}

interface TopBarProps {
  user: AuthUser;
  look: NavLook;
  mobile: boolean;
  menu: NavMenuModule[];
  place: MenuPlace | null;
  pendingCount: number;
  /** Search, Ask, New, Help, the bell and the account, as the sidebar layout's header has them */
  tools: React.ReactNode;
  /** The phone's menu button */
  onOpenMenu: () => void;
  /** Pin to Home for the page on screen */
  pin?: React.ReactNode;
}

/**
 * The top bar (Menu and names): the menu across the top instead of down the side. Home holds the modules; a module's
 * page has its sub-modules in a bar under this one (in the one-bar look, in this bar itself). Three looks: a navy bar, a
 * light frame round the page, and one white bar.
 */
export function TopBar({ user, look, mobile, menu, place, pendingCount, tools, onOpenMenu, pin }: TopBarProps) {
  const inBar = look === 'BAR' && !mobile && !!place;
  return (
    <div className={cx(s.top, LOOK_CLASS[look], mobile && s.mobile)}>
      <header className={s.bar}>
        {mobile ? (
          <>
            <Button type="text" icon={<MenuOutlined />} onClick={onOpenMenu} aria-label="Open menu" data-tour="menu" />
            <Link href="/" className={s.brand} aria-label="Home, all modules">
              <BrandMark size={28} />
            </Link>
          </>
        ) : (
          <>
            <Link href="/" className={s.brand} aria-label="Home, all modules">
              <BrandMark size={look === 'BAR' ? 30 : 28} />
              {!inBar && <Wordmark size={17} />}
            </Link>
            {look !== 'BAR' && (
              <CompanyName user={user} className={s.org} />
            )}
            {inBar ? <ModuleNav menu={menu} place={place} inBar /> : <TopLinks user={user} pendingCount={pendingCount} />}
          </>
        )}
        <span className={s.spacer} />
        {inBar && (
          <span data-tour="project" className={s.project}>
            <ProjectSwitcher width={180} />
          </span>
        )}
        {inBar && pin}
        {/* The one-bar look has no company name beside the brand: its company menu sits with the tools. */}
        {look === 'BAR' && !mobile && <CompanySwitcher user={user} compact maxWidth={0} />}
        <span className={s.tools}>{tools}</span>
      </header>
      {place && !inBar && (
        <div className={s.row}>
          <ModuleNav menu={menu} place={place} mobile={mobile} />
          {!mobile && (
            <>
              <span className={s.spacer} />
              <span data-tour="project" className={s.project}>
                <ProjectSwitcher width={240} />
              </span>
              {pin}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Home's links in the bar: the modules (Home), My work and Approvals. */
function TopLinks({ user, pendingCount }: { user: AuthUser; pendingCount: number }) {
  const pathname = usePathname();
  const myWork = navNode('my-work');
  const links = [
    { href: '/', label: 'Modules', icon: 'layout-grid', show: true },
    { href: '/my-work', label: 'My work', icon: 'list-todo', show: !!myWork && canSeeNav(user, myWork) },
    { href: '/approvals', label: 'Approvals', icon: 'inbox', show: mayApprove(user), count: pendingCount, tour: 'approvals' },
  ];
  return (
    <nav aria-label="Main" className={s.links}>
      <ul>
        {links
          .filter((l) => l.show)
          .map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={cx(s.link, pathname === l.href && s.on)} aria-current={pathname === l.href ? 'page' : undefined} data-tour={l.tour}>
                <TreeIcon name={l.icon} />
                {l.label}
                {!!l.count && (
                  <span className={s.count} translate="no">
                    {l.count > 99 ? '99+' : l.count}
                  </span>
                )}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}

/** The module's name (a menu of every module) and its sub-modules: one page opens; two or more open a menu of them. */
function ModuleNav({ menu, place, mobile, inBar }: { menu: NavMenuModule[]; place: MenuPlace; mobile?: boolean; inBar?: boolean }) {
  const router = useRouter();
  const [projectId] = useProjectScope();
  const [picking, setPicking] = useState<NavNode | null>(null);
  const subs = useRef<HTMLUListElement>(null);
  const { module } = place;
  // On a wider screen the sub-modules that do not fit go under More; a phone's bar scrolls sideways instead.
  const [fit, setFit] = useState<number | null>(null);
  const widths = useRef<number[]>([]);
  const measuredFor = `${module.key}:${mobile}`;
  const [measured, setMeasured] = useState(measuredFor);
  if (measured !== measuredFor) {
    // Another module (or the phone's layout): draw every sub-module again to measure them.
    setMeasured(measuredFor);
    setFit(null);
  }
  const widthsFor = useRef('');
  useLayoutEffect(() => {
    const list = subs.current;
    if (mobile || !list || typeof ResizeObserver === 'undefined') return;
    if (widthsFor.current !== measuredFor) {
      widthsFor.current = measuredFor;
      widths.current = [];
    }
    const measure = () => {
      if (!widths.current.length) {
        // Measured once with every sub-module drawn.
        if (fit !== null) return setFit(null);
        widths.current = Array.from(list.children).map((li) => li.getBoundingClientRect().width + 2);
      }
      const room = list.clientWidth;
      if (widths.current.reduce((a, b) => a + b, 0) <= room) return setFit(null);
      let used = MORE_WIDTH;
      let n = 0;
      while (n < widths.current.length && used + widths.current[n] <= room) used += widths.current[n++];
      setFit(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [mobile, fit, measuredFor]);
  // The sub-module on screen stays in view where the bar scrolls sideways (a phone), without moving the page.
  const at = place.sub?.key ?? '';
  useEffect(() => {
    const list = subs.current;
    const on = list?.querySelector<HTMLElement>(`.${s.on}`);
    if (!list || !on) return;
    const box = list.getBoundingClientRect();
    const it = on.getBoundingClientRect();
    list.scrollLeft = Math.max(0, list.scrollLeft + it.left - box.left - (box.width - it.width) / 2);
  }, [at, module.key, mobile, fit]);
  const go = (node: NavNode) => {
    const href = hrefOf(node, projectId);
    if (href) router.push(href);
    else setPicking(node);
  };
  const switchItems: MenuProps['items'] = [
    { key: 'home', icon: <TreeIcon name="layout-grid" />, label: <Link href="/">All modules</Link> },
    { type: 'divider' },
    ...menu.map((m) => ({ key: m.key, icon: <TreeIcon name={m.icon} />, label: <Link href={moduleScreenHref(m.key)}>{m.label}</Link> })),
  ];
  return (
    <nav aria-label={module.label} className={cx(s.module, inBar && s.moduleInBar)}>
      <Dropdown
        trigger={['click']}
        menu={{
          items: switchItems,
          selectedKeys: [module.key],
          onClick: ({ key, domEvent }) => {
            if (domEvent.type !== 'keydown') return;
            router.push(key === 'home' ? '/' : moduleScreenHref(key));
          },
        }}
      >
        <button type="button" className={s.switch} aria-label={`${module.label}, switch module`} aria-haspopup="menu">
          <TreeIcon name={module.icon} />
          {!mobile && <span className={s.switchName}>{module.label}</span>}
          <DownOutlined className={s.chevron} aria-hidden />
        </button>
      </Dropdown>
      <ul ref={subs} className={s.subs} data-scroll-region={mobile ? true : undefined}>
        <li>
          <Link href={moduleScreenHref(module.key)} className={cx(s.sub, !place.sub && s.on)} aria-current={!place.sub ? 'page' : undefined}>
            Overview
          </Link>
        </li>
        {(fit === null ? module.subs : module.subs.slice(0, fit - 1)).map((sub) => (
          <li key={sub.key}>
            <SubLink sub={sub} place={place} projectId={projectId} onGo={go} />
          </li>
        ))}
        {fit !== null && fit - 1 < module.subs.length && (
          <li>
            <MoreSubs subs={module.subs.slice(fit - 1)} place={place} projectId={projectId} onGo={go} />
          </li>
        )}
      </ul>
      <ProjectPick node={picking} onClose={() => setPicking(null)} />
    </nav>
  );
}

const MORE_WIDTH = 96;

/** The sub-modules that do not fit in the bar, as one menu (a sub-module of several pages opens to them). */
function MoreSubs({ subs, place, projectId, onGo }: { subs: NavMenuSub[]; place: MenuPlace; projectId: string | undefined; onGo: (node: NavNode) => void }) {
  const here = subs.some((x) => x.key === place.sub?.key);
  const nodeItem = (n: NavNode, label: string) => {
    const href = hrefOf(n, projectId);
    return { key: n.id, label: href ? <Link href={href}>{label}</Link> : label };
  };
  const items: MenuProps['items'] = subs.map((sub) =>
    sub.nodes.length === 1 ? nodeItem(sub.nodes[0], sub.label) : { key: `sub-${sub.key}`, label: sub.label, children: sub.nodes.map((n) => nodeItem(n, n.label)) },
  );
  const current = place.node;
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items,
        selectedKeys: current ? [current.id] : [],
        onClick: ({ key, domEvent }) => {
          const node = subs.flatMap((x) => x.nodes).find((n) => n.id === key);
          if (node && (domEvent.type === 'keydown' || !hrefOf(node, projectId))) onGo(node);
        },
      }}
    >
      <button type="button" className={cx(s.sub, here && s.on)} aria-haspopup="menu">
        {here && place.sub ? place.sub.label : 'More'}
        <DownOutlined className={s.chevron} aria-hidden />
      </button>
    </Dropdown>
  );
}

function SubLink({ sub, place, projectId, onGo }: { sub: NavMenuSub; place: MenuPlace; projectId: string | undefined; onGo: (node: NavNode) => void }) {
  const here = place.sub?.key === sub.key;
  const current = place.node;
  if (sub.nodes.length === 1) {
    const node = sub.nodes[0];
    const href = hrefOf(node, projectId);
    const isPage = here && current && (current.id === node.id || node.shortcutOf === current.id);
    return href ? (
      <Link href={href} className={cx(s.sub, here && s.on)} aria-current={isPage ? 'page' : undefined}>
        {sub.label}
      </Link>
    ) : (
      <button type="button" className={cx(s.sub, here && s.on)} onClick={() => onGo(node)} aria-haspopup="dialog">
        {sub.label}
      </button>
    );
  }
  const items: MenuProps['items'] = sub.nodes.map((n) => {
    const href = hrefOf(n, projectId);
    return { key: n.id, label: href ? <Link href={href}>{n.label}</Link> : n.label };
  });
  const selected = here && current ? sub.nodes.filter((n) => n.id === current.id || n.shortcutOf === current.id).map((n) => n.id) : [];
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items,
        selectedKeys: selected,
        onClick: ({ key, domEvent }) => {
          const node = sub.nodes.find((n) => n.id === key);
          // A click lands on the link; the keyboard and a page with no project yet go here.
          if (node && (domEvent.type === 'keydown' || !hrefOf(node, projectId))) onGo(node);
        },
      }}
    >
      <button type="button" className={cx(s.sub, here && s.on)} aria-haspopup="menu">
        {sub.label}
        <DownOutlined className={s.chevron} aria-hidden />
      </button>
    </Dropdown>
  );
}

/** Pin to Home, in the module bar. */
export function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <Tooltip title={pinned ? 'Unpin from Home' : 'Pin to Home'}>
      <Button type="text" size="small" aria-label="Pin to Home" aria-pressed={pinned} icon={<TreeIcon name={pinned ? 'pin-off' : 'pin'} />} onClick={onToggle} className={s.pin} />
    </Tooltip>
  );
}
