'use client';

import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { AuthUser, NavMenuModule, NavMenuSub, NavNode, NavSettingsDto, PendingApprovalDto } from '@erp/shared';
import { isGuest, isSupplier, menuWaiting, navMenuFor, navMenuPlace, navNodeForPath, navSettingsOf } from '@erp/shared';

/**
 * The company's menu on the web (Menu and names): its settings with the person's own look, the modules this user sees in
 * the company's set and under its names, and where the page on screen is in it. The top bar, its module bar, Home's
 * tiles and a department module's screen read from here; the sidebar reads the same set through `navFor`.
 */
export function useNavMenu(user: AuthUser | null): { settings: NavSettingsDto; menu: NavMenuModule[] } {
  const settings = useMemo(() => navSettingsOf(user ?? {}), [user]);
  const menu = useMemo(() => (!user || isGuest(user.roleKey) || isSupplier(user.roleKey) ? [] : navMenuFor(user, settings)), [user, settings]);
  return { settings, menu };
}

/** Where the page is: a module's screen (no sub-module), or a page of a sub-module. */
export interface MenuPlace {
  module: NavMenuModule;
  sub: NavMenuSub | null;
  node: NavNode | null;
}

/** The module and sub-module of the page on screen. A page in two modules stays in the one the user came from. */
export function useMenuPlace(menu: NavMenuModule[]): MenuPlace | null {
  const pathname = usePathname();
  const search = useSearchParams();
  const [last, setLast] = useState<string | null>(null);
  const query = search.toString();
  const place = useMemo((): MenuPlace | null => {
    const key = /^\/modules\/([\w-]+)$/.exec(pathname)?.[1];
    if (key) {
      const mod = menu.find((m) => m.key === key);
      return mod ? { module: mod, sub: null, node: null } : null;
    }
    const allowed = new Set(menu.flatMap((m) => m.subs.flatMap((x) => x.nodes.map((n) => n.shortcutOf ?? n.id))));
    const node = navNodeForPath(pathname, query, (n) => allowed.has(n.id));
    const at = node ? navMenuPlace(menu, node.id, last) : null;
    return at && node ? { ...at, node } : null;
  }, [menu, pathname, query, last]);
  // Remembered as the page changes (set while rendering, React's pattern for state that follows a value).
  const here = place?.module.key;
  if (here && here !== last) setLast(here);
  return place;
}

/**
 * What waits on the user in each module (`menuWaiting`): their approvals whose list is one of its pages, and the queues
 * counted on its pages (requests to order, material to check…).
 */
export function moduleWaiting(menu: NavMenuModule[], pending: PendingApprovalDto[] | undefined, nodeBadges: Record<string, number> | undefined): Record<string, number> {
  return menuWaiting(menu, (pending ?? []).map((p) => ({ type: p.type, count: 1 })), nodeBadges);
}
