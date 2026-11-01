'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Empty, Flex, Input, Skeleton, Typography } from 'antd';
import type { AuthUser, NavMenuModule, NavNode, NavVisitDto } from '@erp/shared';
import { NAV_TREE, NAV_VISIT_KIND_LABELS, canSeeNav, navDestination, navMenuPlace, navNode, navNodeAt, navNodeForPath, navTilesFor } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { formatLongDay } from '@/lib/format';
import { readPref, writePref } from '@/lib/prefs';
import { useLauncherBadges } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/page-title';
import { GettingStartedCard, useGettingStarted } from '@/components/dashboard/GettingStartedCard';
import { TreeIcon } from '@/components/shell/nav-icons';
import { useNavMenu } from '@/components/shell/menu';
import { requestSearch } from '@/components/shell/search-request';
import { TileGrid, tileEntries } from './TileGrid';
import { pinEntry, usePins } from './pins';
import { EditPins } from './EditPins';
import { DiscoverSection } from './Discover';
import { WaitingForYou } from './WaitingForYou';
import { MenuModules, useMenuWaiting } from './MenuModules';
import s from './HomeLauncher.module.css';

const greeting = (hour: number) => (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');

/** Pages to suggest pinning when Pinned is empty: the first three the user can open. */
const SUGGESTED = ['approvals', 'site.dpr', 'billing.bills', 'purchases.orders', 'materials.requests', 'people.me', 'accounts.payables', 'projects.all'];

/** Everything the search box looks through: modules and pages the user can open (not shortcuts, which repeat a page). */
function searchable(user: AuthUser): NavNode[] {
  return NAV_TREE.filter((n) => n.tile !== false && !n.shortcutOf && canSeeNav(user, n));
}

function matches(nodes: NavNode[], query: string): NavNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  return nodes
    .map((n) => {
      const label = n.label.toLowerCase();
      const hay = `${label} ${(n.keywords ?? '').toLowerCase()} ${(n.description ?? '').toLowerCase()} ${n.parent ? (navNode(n.parent)?.label ?? '').toLowerCase() : ''}`;
      if (!words.every((w) => hay.includes(w))) return null;
      const rank = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2;
      return { n, rank };
    })
    .filter((x): x is { n: NavNode; rank: number } => !!x)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 12)
    .map((x) => x.n);
}

/** The old Home kept favourites and recent pages in this browser; they go to the account once, the first time Home opens. */
function useImportOnce(user: AuthUser | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const done = `nirmaan.launcher-imported.${user.id}`;
    if (readPref<boolean>(done, false)) return;
    const favKey = `nirmaan.favourites.${user.id}`;
    const recentKey = `nirmaan.recent.${user.id}`;
    const favourites = readPref<string[]>(favKey, []);
    const recent = readPref<unknown[]>(recentKey, []).flatMap((r) => (r && typeof r === 'object' && typeof (r as { href?: unknown }).href === 'string' ? [r as { href: string; at?: number }] : []));
    writePref(done, true);
    if (!favourites.length && !recent.length) return;
    const place = (href: string) => {
      const project = href.match(/^\/projects\/([\w-]+)$/)?.[1];
      if (project) return { kind: 'PROJECT' as const, target: project, label: 'Project' };
      const [path, query = ''] = href.split('?');
      const node = navNodeAt(path, query);
      return node ? { kind: 'NODE' as const, target: node.id, label: node.label } : null;
    };
    const pins = favourites.flatMap((h) => {
      const p = place(h);
      return p ? [p] : [];
    });
    const visits = recent.flatMap((r) => {
      const p = place(r.href);
      return p ? [{ ...p, href: r.href, at: r.at || Date.now() - 86_400_000 }] : [];
    });
    api
      .post('/launcher/import', { pins, visits })
      .then(() => {
        writePref(favKey, []);
        writePref(recentKey, []);
        qc.invalidateQueries({ queryKey: ['launcher'], exact: true });
      })
      .catch(() => writePref(done, false));
  }, [user, qc]);
}

function RecentLink({ visit, user, menu }: { visit: NavVisitDto; user: AuthUser; menu: NavMenuModule[] }) {
  const node = visit.kind === 'NODE' ? navNode(visit.target) : undefined;
  if (visit.kind === 'NODE' && (!node || !canSeeNav(user, node))) return null;
  // A page under its module's name in the company's menu, a module itself says so, and a record under its list's name.
  const record = visit.kind === 'RECORD' ? navNodeForPath(visit.href.split('?')[0]) : undefined;
  const where = node?.parent
    ? (navMenuPlace(menu, node.id)?.module.label ?? navNode(node.parent)?.label)
    : node && !node.route
      ? 'Module'
      : (record?.label ?? NAV_VISIT_KIND_LABELS[visit.kind]);
  return (
    <li>
      <Link href={visit.href} className={s.recent}>
        <span className={s.recentIcon} aria-hidden>
          <TreeIcon name={node?.icon ?? (visit.kind === 'PROJECT' ? 'folder-kanban' : 'history')} />
        </span>
        <span className={s.recentText}>
          <span className={s.recentLabel} translate={visit.kind === 'NODE' ? undefined : 'no'}>
            {node?.label ?? visit.label}
          </span>
          <span className={s.recentKind}>{where}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Home: search over modules and pages, what waits for you (My work's top cards), Pinned (yours, on
 * every device), Recent, and every module you can open as a tile with what waits on you there. The module grid comes
 * from the navigation tree and the signed-in user, so it draws at once; pins, Recent and the counts fill in after.
 */
export function HomeLauncher() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const gettingStarted = useGettingStarted();
  const { pins, ready, pin, tileMenu, recent, launcher } = usePins(user);
  const { data: badges } = useLauncherBadges(!!user);
  useImportOnce(user);
  usePageTitle('Home');

  const { settings, menu } = useNavMenu(user);
  const waiting = useMenuWaiting(user, menu);
  const topBar = settings.layout === 'TOP_BAR' && menu.length > 0;
  // The sidebar with the work-area set keeps Home's tiles as they were (pages at the top of the tree too), under the
  // company's names; anything else shows the company's modules.
  const treeTiles = settings.layout === 'SIDEBAR' && settings.moduleSet === 'AREAS';
  const modules = useMemo(() => (user && treeTiles ? navTilesFor(user, null) : []), [user, treeTiles]);
  const moduleCount = treeTiles ? modules.length : menu.length;
  const all = useMemo(() => (user ? searchable(user) : []), [user]);
  const found = useMemo(() => matches(all, query), [all, query]);
  const suggestions = useMemo(
    () =>
      user
        ? SUGGESTED.map((id) => navNode(id))
            .filter((n): n is NavNode => !!n && canSeeNav(user, n))
            .slice(0, 3)
        : [],
    [user],
  );
  if (!user) return null;

  const first = user.fullName.split(' ')[0];
  const recentShown = recent.filter((v) => v.href !== '/').slice(0, 5);
  const openFirst = () => {
    const n = found[0];
    const to = n && navDestination(n);
    if (to?.kind === 'page') router.push(to.href);
  };

  return (
    <div className="page-container">
      <div className={s.head}>
        <h1 className={s.title} tabIndex={-1}>
          {greeting(new Date().getHours())}, <span translate="no">{first}</span>
        </h1>
        <Typography.Text type="secondary">
          {formatLongDay(new Date())}. {moduleCount} modules you can open.
        </Typography.Text>
      </div>
      <div className={s.search}>
        <Input
          size="large"
          allowClear
          prefix={<TreeIcon name="search" />}
          placeholder="Search modules and pages"
          aria-label="Search modules and pages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={openFirst}
        />
      </div>
      <GettingStartedCard state={gettingStarted} />

      {query.trim() ? (
        <section aria-labelledby="home-found" className={s.section}>
          <h2 id="home-found" className={s.sectionTitle}>
            Pages matching “{query.trim()}”
          </h2>
          {found.length ? (
            <TileGrid entries={tileEntries(found, badges?.nodes)} label={`Pages matching ${query.trim()}`} menu={tileMenu} />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<>No page is called “{query.trim()}”. It may be a record: a vendor, an item or a bill.</>}>
              <Button type="primary" onClick={() => requestSearch(query.trim())}>
                Search records for “{query.trim()}”
              </Button>
            </Empty>
          )}
          {found.length > 0 && (
            <p className={s.hint}>
              Looking for a record?{' '}
              <Button type="link" className={s.inlineLink} onClick={() => requestSearch(query.trim())}>
                Search records for “{query.trim()}”
              </Button>
            </p>
          )}
        </section>
      ) : (
        <>
          {topBar && (
            <section aria-labelledby="home-modules" className={s.section}>
              <h2 id="home-modules" className={s.sectionTitle}>
                Modules
              </h2>
              <MenuModules menu={menu} look={settings.look} waiting={waiting} label="Modules" menuFor={tileMenu} />
            </section>
          )}

          <WaitingForYou user={user} />

          <section aria-labelledby="home-pinned" className={s.section}>
            <Flex justify="space-between" align="center" className={s.sectionHead}>
              <h2 id="home-pinned" className={s.sectionTitle}>
                Pinned
              </h2>
              {pins.length > 1 && (
                <Button type="link" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
                  {editing ? 'Done' : 'Edit pins'}
                </Button>
              )}
            </Flex>
            {!ready ? (
              <Skeleton.Button active block style={{ height: 64 }} />
            ) : editing ? (
              <EditPins user={user} />
            ) : pins.length ? (
              <TileGrid entries={pins.map(pinEntry)} label="Pinned" menu={tileMenu} compact />
            ) : (
              <div className={s.empty}>
                <p className={s.emptyText}>Keep the pages you use every day here. Use Pin to Home on any page, or a tile’s menu.</p>
                {suggestions.length > 0 && (
                  <Flex gap="small" wrap>
                    {suggestions.map((n) => (
                      <Button key={n.id} icon={<TreeIcon name="pin" />} onClick={() => pin('NODE', n.id, n.label)}>
                        Pin {n.label}
                      </Button>
                    ))}
                  </Flex>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="home-recent" className={s.section}>
            <h2 id="home-recent" className={s.sectionTitle}>
              Recent
            </h2>
            {!ready ? (
              <Skeleton.Button active block style={{ height: 52 }} />
            ) : recentShown.length ? (
              <ul className={s.recentList}>
                {recentShown.map((v) => (
                  <RecentLink key={`${v.kind}:${v.target}`} visit={v} user={user} menu={menu} />
                ))}
              </ul>
            ) : (
              <p className={s.emptyText}>The last 5 pages you open show here, on every device you sign in on.</p>
            )}
          </section>

          <DiscoverSection user={user} launcher={launcher} />

          {!topBar && (
            <section aria-labelledby="home-modules" className={s.section}>
              <h2 id="home-modules" className={s.sectionTitle}>
                All modules
              </h2>
              {treeTiles ? (
                <TileGrid entries={tileEntries(modules, badges?.nodes).map((e) => ({ ...e, label: settings.names[e.key]?.trim() || undefined }))} label="All modules" menu={tileMenu} />
              ) : (
                <MenuModules menu={menu} look="SIDEBAR" waiting={waiting} label="All modules" menuFor={tileMenu} />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
