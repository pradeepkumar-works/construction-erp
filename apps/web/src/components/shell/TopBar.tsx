'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import { DownOutlined, MenuOutlined } from '@/components/common/icons';
import type { AuthUser, NavLayout, NavLook, NavMenuModule, NavMenuSub, NavNode } from '@erp/shared';
import { canSeeNav, mayApprove, moduleScreenHref, navDestination, navNode, projectTabHref } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { ProjectPick } from '@/components/launcher/TileGrid';
import { BrandMark, Wordmark } from './BrandMark';
import { ProjectSwitcher } from './ProjectSwitcher';
import { CompanyName, CompanySwitcher } from './CompanySwitcher';
import { TreeIcon } from './nav-icons';
import type { MenuPlace } from './menu';
import s from './TopBar.module.css';

const LOOK_CLASS = { NAVY: undefined, FRAME: s.lookFrame, BAR: s.lookBar } as const;
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** Whether the modules themselves are across the top bar (Top bar and sidebar, Two top bars) on a wider screen. */
const modulesOnBar = (layout: NavLayout, mobile: boolean) => !mobile && (layout === 'TOP_AND_SIDE' || layout === 'TWO_BARS');

/** How tall the top of the page is in each layout and look, for anything sticky below it (`useStickyTop`). */
export function topBarHeight(layout: NavLayout, look: NavLook, mobile: boolean, withModule: boolean): number {
  if (mobile) return 56 + (withModule ? 44 : 0);
  if (layout === 'TOP_AND_SIDE') return 56;
  if (layout === 'TWO_BARS') return 56 + 48;
  if (look === 'BAR') return 60;
  return 56 + (withModule ? 48 : 0);
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
  /** The top bar layout, Top bar and sidebar, or Two top bars (a phone draws them all as the top bar) */
  layout: NavLayout;
  look: NavLook;
  /** Which parts are in the menu's colours: `top` the bar, `side` the second bar of Two top bars (`navPainted`) */
  painted: { side: boolean; top: boolean };
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
 * The top bar (Menu and names): the menu across the top instead of down the side. In the top bar layout Home holds the
 * modules and a module's page has its sub-modules in a bar under this one (in the one-bar look, in this bar itself), in
 * three looks: a coloured bar, a light frame round the page, and one white bar. With Top bar and sidebar the modules are
 * across this bar and the sub-modules down the side; with Two top bars the modules are across this bar and the
 * sub-modules across a second one.
 */
export function TopBar({ user, layout, look, painted, mobile, menu, place, pendingCount, tools, onOpenMenu, pin }: TopBarProps) {
  const topBarLayout = layout === 'TOP_BAR';
  const modules = modulesOnBar(layout, mobile);
  const inBar = topBarLayout && look === 'BAR' && !mobile && !!place;
  const paintRow = layout === 'TWO_BARS' && painted.side && !mobile;
  // Two top bars always has its second bar: the module's sub-modules, or Home's links where no module is open.
  const row = !mobile && layout === 'TWO_BARS' ? 'always' : place && !inBar && !(modules && layout === 'TOP_AND_SIDE') ? 'module' : null;
  return (
    <div className={cx(s.top, topBarLayout && LOOK_CLASS[look], painted.top && s.paintTop, paintRow && s.paintRow, mobile && s.mobile)}>
      <header className={cx(s.bar, painted.top && s.onChrome)}>
        {mobile ? (
          <>
            <Button type="text" icon={<MenuOutlined />} onClick={onOpenMenu} aria-label="Open menu" data-tour="menu" />
            <Link href="/" className={s.brand} aria-label="Home">
              <BrandMark size={28} />
            </Link>
          </>
        ) : (
          <>
            <Link href="/" className={s.brand} aria-label="Home">
              <BrandMark size={look === 'BAR' && topBarLayout ? 30 : 28} />
              {!inBar && <Wordmark size={17} />}
            </Link>
            {topBarLayout && look !== 'BAR' && <CompanyName user={user} className={s.org} />}
            {modules ? <ModuleLinks menu={menu} place={place} /> : inBar ? <ModuleNav menu={menu} place={place} inBar /> : <TopLinks user={user} pendingCount={pendingCount} />}
          </>
        )}
        {!modules && <span className={s.spacer} />}
        {(inBar || (modules && layout === 'TOP_AND_SIDE')) && (
          <span data-tour="project" className={s.project}>
            <ProjectSwitcher width={180} />
          </span>
        )}
        {(inBar || (modules && layout === 'TOP_AND_SIDE')) && pin}
        {/* Without a company name beside the brand, the company menu sits with the tools. */}
        {!mobile && !(topBarLayout && look !== 'BAR') && <CompanySwitcher user={user} compact maxWidth={0} />}
        <span className={s.tools}>{tools}</span>
      </header>
      {row && (
        <div className={cx(s.row, paintRow && s.onChrome)}>
          {place ? <ModuleNav menu={menu} place={place} mobile={mobile} noSwitch={modules} /> : <TopLinks user={user} pendingCount={pendingCount} />}
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

const MORE_WIDTH = 96;

/**
 * How many of a list's items fit in its width, with room kept for a More button; null when they all fit. Each item is
 * measured once with every one drawn (again when `key` changes); a phone's bar scrolls sideways instead (`off`). With
 * `pinned`, that item's room is kept first and the count is of the others, so the item on screen is never under More.
 */
function useFit(list: React.RefObject<HTMLUListElement | null>, key: string, off: boolean, pinned = -1): number | null {
  const [fit, setFit] = useState<number | null>(null);
  const [measured, setMeasured] = useState(key);
  if (measured !== key) {
    setMeasured(key);
    setFit(null);
  }
  const widths = useRef<number[]>([]);
  const widthsFor = useRef('');
  useLayoutEffect(() => {
    const el = list.current;
    if (off || !el || typeof ResizeObserver === 'undefined') return;
    if (widthsFor.current !== key) {
      widthsFor.current = key;
      widths.current = [];
    }
    const measure = () => {
      if (!widths.current.length) {
        if (fit !== null) return setFit(null);
        widths.current = Array.from(el.children).map((li) => li.getBoundingClientRect().width + 2);
      }
      const room = el.clientWidth;
      if (widths.current.reduce((a, b) => a + b, 0) <= room) return setFit(null);
      const others = widths.current.filter((_, i) => i !== pinned);
      let used = MORE_WIDTH + (widths.current[pinned] ?? 0);
      let n = 0;
      while (n < others.length && used + others[n] <= room) used += others[n++];
      setFit(Math.max(pinned >= 0 ? 0 : 1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list, off, fit, key, pinned]);
  return fit;
}

/** The modules across the top bar, each opening its screen; those that do not fit go under More. */
function ModuleLinks({ menu, place }: { menu: NavMenuModule[]; place: MenuPlace | null }) {
  const router = useRouter();
  const list = useRef<HTMLUListElement>(null);
  const at = place?.module.key;
  const fit = useFit(list, menu.map((m) => `${m.key}:${m.label}`).join(), false, menu.findIndex((m) => m.key === at));
  // The module on screen always keeps its place in the bar; the others fill the room left in their order.
  const others = menu.filter((m) => m.key !== at);
  const kept = new Set(fit === null ? menu.map((m) => m.key) : [...others.slice(0, fit).map((m) => m.key), ...(at ? [at] : [])]);
  const shown = menu.filter((m) => kept.has(m.key));
  const rest = menu.filter((m) => !kept.has(m.key));
  return (
    <nav aria-label="Modules" className={s.modules} data-tour="modules">
      <ul ref={list} className={s.moduleList}>
        {shown.map((m) => (
          <li key={m.key}>
            <Link href={moduleScreenHref(m.key)} className={cx(s.link, m.key === at && s.on)} aria-current={m.key === at ? (place?.sub ? 'true' : 'page') : undefined}>
              <TreeIcon name={m.icon} />
              {m.label}
            </Link>
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <Dropdown
              trigger={['click']}
              menu={{
                items: rest.map((m) => ({ key: m.key, icon: <TreeIcon name={m.icon} />, label: <Link href={moduleScreenHref(m.key)}>{m.label}</Link> })),
                selectedKeys: at ? [at] : [],
                onClick: ({ key, domEvent }) => {
                  if (domEvent.type === 'keydown') router.push(moduleScreenHref(key));
                },
              }}
            >
              <button type="button" className={cx(s.link, s.more)} aria-haspopup="menu">
                More
                <DownOutlined className={s.chevron} aria-hidden />
              </button>
            </Dropdown>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** Home's links in the bar: the modules (Home), My work and Approvals. */
function TopLinks({ user, pendingCount }: { user: AuthUser; pendingCount: number }) {
  const pathname = usePathname();
  const myWork = navNode('my-work');
  const links = [
    { href: '/', label: 'Home', icon: 'layout-grid', show: true, tour: 'modules' },
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
                    {l.count.toLocaleString('en-IN')}
                  </span>
                )}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}

/** The module's name (a menu of every module) and its sub-modules: one page opens; two or more open a menu of them. With
 *  the modules across the bar above (`noSwitch`), the module's name is left there. */
function ModuleNav({ menu, place, mobile, inBar, noSwitch }: { menu: NavMenuModule[]; place: MenuPlace; mobile?: boolean; inBar?: boolean; noSwitch?: boolean }) {
  const router = useRouter();
  const [projectId] = useProjectScope();
  const [picking, setPicking] = useState<NavNode | null>(null);
  const subs = useRef<HTMLUListElement>(null);
  const { module } = place;
  // On a wider screen the sub-modules that do not fit go under More; a phone's bar scrolls sideways instead.
  const fit = useFit(subs, `${module.key}:${mobile}`, !!mobile);
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
    { key: 'home', icon: <TreeIcon name="layout-grid" />, label: <Link href="/">Home</Link> },
    { type: 'divider' },
    ...menu.map((m) => ({ key: m.key, icon: <TreeIcon name={m.icon} />, label: <Link href={moduleScreenHref(m.key)}>{m.label}</Link> })),
  ];
  return (
    <nav aria-label={module.label} className={cx(s.module, inBar && s.moduleInBar)}>
      {!noSwitch && (
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
      )}
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
