'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { HistoryOutlined, ProjectOutlined } from '@/components/common/icons';
import type { AuthUser, NavPinKind, NavVisitKind } from '@erp/shared';
import { LAUNCHER_VISIT_GAP_MS, canSeeNav, isGuest, navNode, navNodeAt } from '@erp/shared';
import { API_URL, getToken } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { usePins } from '@/components/launcher/pins';
import { navIcon } from './nav-icons';
import type { NavItem, NavSection } from './nav';

const PROJECT_PAGE = /^\/projects\/([\w-]+)$/;

/** A page opened lately, for Search (Ctrl K) before anything is typed. */
export interface RecentPage {
  item: NavItem;
  at: number;
}

/** What the page you are on can be pinned as: its node in the menu, or the project whose page it is. */
export interface PinPlace {
  kind: NavPinKind;
  target: string;
  label: string;
}

const lastSent = new Map<string, number>();

/** Tells the server a place was opened (for Recent), at most once in a short while for the same place. `keepalive`, so the
 *  visit still lands when the page is left at once (a typed address, a reload). */
export function recordVisit(kind: NavVisitKind, target: string, label: string, href: string) {
  const key = `${kind}:${target}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < LAUNCHER_VISIT_GAP_MS) return Promise.resolve(false);
  lastSent.set(key, now);
  const token = getToken();
  return fetch(`${API_URL}/launcher/visits`, {
    method: 'POST',
    keepalive: true,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ kind, target, label: label.slice(0, 120), href }),
  }).then(
    (res) => res.ok,
    () => false,
  );
}

/**
 * The shell's part of the launcher (phase 2): Pinned as a sidebar section, the header's Pin to Home for the page you are
 * on, each place opened recorded for Recent, and Recent for Search (Ctrl K). Pins and Recent are kept on the server.
 */
export function useShellPins(user: AuthUser) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qc = useQueryClient();
  const guest = isGuest(user.roleKey);
  const { pins, pinOf, pin, unpin, recent } = usePins(guest ? null : user);
  const { data: projects } = useProjects(!guest);

  const query = search.toString();
  const place = useMemo<PinPlace | null>(() => {
    if (guest) return null;
    const project = pathname.match(PROJECT_PAGE)?.[1];
    if (project && !query) {
      const p = projects?.find((x) => x.id === project);
      return p ? { kind: 'PROJECT', target: p.id, label: p.name } : null;
    }
    if (pathname === '/') return null;
    const node = navNodeAt(pathname, query, (n) => canSeeNav(user, n));
    return node ? { kind: 'NODE', target: node.id, label: node.label } : null;
  }, [guest, pathname, query, projects, user]);

  // Each place opened, for Recent on Home and in Search.
  useEffect(() => {
    if (!place) return;
    const href = query ? `${pathname}?${query}` : pathname;
    recordVisit(place.kind, place.target, place.label, href).then((sent) => {
      if (sent) qc.invalidateQueries({ queryKey: ['launcher'], exact: true });
    });
  }, [place, pathname, query, qc]);

  const pinned = place ? pinOf(place.kind, place.target) : null;
  const togglePin = useCallback(() => {
    if (!place) return;
    if (pinned) unpin(pinned);
    else pin(place.kind, place.target, place.label);
  }, [place, pinned, pin, unpin]);

  const pinSections = useMemo<NavSection[]>(() => {
    const items: NavItem[] = pins.flatMap((p): NavItem[] => {
      if (p.kind === 'PROJECT') return [{ href: `/projects/${p.target}`, label: p.label, icon: ProjectOutlined }];
      const node = navNode(p.target);
      const href = node?.route?.split('?')[0] ?? (node && !node.parent ? `/modules/${node.id}` : null);
      // A tab pinned from its page opens the page (the sidebar links pages, not tabs).
      return node && href ? [{ href: node.route ?? href, label: node.label, icon: navIcon(node.icon), node }] : [];
    });
    return items.length ? [{ key: 'pinned', title: 'Pinned', icon: navIcon('pin'), items, exact: true }] : [];
  }, [pins]);

  // Not the page you are on.
  const recentPages = useMemo<RecentPage[]>(
    () =>
      recent
        .filter((r) => r.href !== pathname && r.kind !== 'RECORD')
        .flatMap((r): RecentPage[] => {
          if (r.kind === 'PROJECT') return [{ item: { href: r.href, label: r.label, icon: ProjectOutlined }, at: Date.parse(r.lastAt) }];
          const node = navNode(r.target);
          return node && canSeeNav(user, node) ? [{ item: { href: r.href, label: node.label, icon: navIcon(node.icon) }, at: Date.parse(r.lastAt) }] : [];
        }),
    [recent, pathname, user],
  );
  const recentRecords = useMemo(() => recent.filter((r) => r.kind === 'RECORD').map((r): RecentPage => ({ item: { href: r.href, label: r.label, icon: HistoryOutlined }, at: Date.parse(r.lastAt) })), [recent]);

  return { place, isPinned: !!pinned, togglePin, pinSections, recentPages: [...recentPages, ...recentRecords].sort((a, b) => b.at - a.at) };
}
