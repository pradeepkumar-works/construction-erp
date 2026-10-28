'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { AuthUser, NavLook, NavMenuModule, NavMenuSub } from '@erp/shared';
import { NAV_MENU_GROUPS, mayApprove, moduleScreenHref, navDestination, navMenuGroup, navNode } from '@erp/shared';
import { familyColors } from '@/lib/brand';
import { useAppearance } from '@/lib/appearance';
import { useLauncherBadges, usePendingApprovals } from '@/lib/queries';
import { TreeIcon } from '@/components/shell/nav-icons';
import { moduleWaiting } from '@/components/shell/menu';
import { TileGrid, type TileEntry, type TileMenu } from './TileGrid';
import s from './MenuModules.module.css';

/** What waits on the user in each of the company's modules: a work-area module's own badge, else its pages' and approvals'. */
export function useMenuWaiting(user: AuthUser | null, menu: NavMenuModule[]): Record<string, number> {
  const approver = !!user && mayApprove(user);
  const { data: badges } = useLauncherBadges(!!user);
  const { data: pending } = usePendingApprovals(approver);
  return useMemo(() => {
    const own = moduleWaiting(menu, approver ? pending : [], badges?.nodes);
    for (const m of menu) {
      const badge = badges?.nodes?.[m.key];
      if (badge !== undefined) own[m.key] = badge;
    }
    return own;
  }, [menu, pending, badges, approver]);
}

/** A sub-module's link on Home: its first page, or the module's screen when its pages need a project or are several. */
function subHref(module: NavMenuModule, sub: NavMenuSub): string {
  const to = sub.nodes.length === 1 ? navDestination(sub.nodes[0]) : null;
  return to?.kind === 'page' ? to.href : moduleScreenHref(module.key);
}

// A work-area module is a node of the tree, so its tile can be pinned like any other.
const tile = (m: NavMenuModule, waiting: Record<string, number>, group?: string): TileEntry => ({
  key: m.key,
  node: navNode(m.key),
  label: m.label,
  icon: m.icon,
  family: m.family,
  description: m.description,
  href: moduleScreenHref(m.key),
  badge: waiting[m.key],
  group: group ?? null,
});

/**
 * Home's modules (Menu and names): the company's set under its names. The navy look and the sidebar have tiles; the light
 * frame lists each module with its sub-modules, so a page is one click from Home; the one-bar look groups the tiles.
 */
export function MenuModules({ menu, look, waiting, label, menuFor }: { menu: NavMenuModule[]; look: NavLook | 'SIDEBAR'; waiting: Record<string, number>; label: string; menuFor?: TileMenu }) {
  const { dark } = useAppearance();
  if (look === 'FRAME')
    return (
      <ul className={s.directory} aria-label={label}>
        {menu.map((m) => {
          const { fg, bg } = familyColors(m.family, dark);
          const count = waiting[m.key];
          return (
            <li key={m.key} className={s.entry}>
              <span className={s.chip} style={{ color: fg, background: bg }} aria-hidden>
                <TreeIcon name={m.icon} />
              </span>
              <div className={s.body}>
                <div className={s.nameRow}>
                  <Link href={moduleScreenHref(m.key)} className={s.name} aria-label={count ? `${m.label}, ${count} waiting` : undefined}>
                    {m.label}
                  </Link>
                  {!!count && (
                    <span className={s.waiting} aria-hidden translate="no">
                      {count} waiting
                    </span>
                  )}
                </div>
                <ul className={s.subs} aria-label={`In ${m.label.toLowerCase()}`}>
                  {m.subs.map((sub) => (
                    <li key={sub.key}>
                      <Link href={subHref(m, sub)} className={s.sub}>
                        {sub.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    );
  if (look === 'BAR') {
    const entries = NAV_MENU_GROUPS.flatMap((g) => menu.filter((m) => navMenuGroup(m) === g).map((m) => tile(m, waiting, g)));
    return <TileGrid entries={entries} label={label} menu={menuFor} headingLevel={3} />;
  }
  return <TileGrid entries={menu.map((m) => tile(m, waiting))} label={label} menu={menuFor} />;
}
