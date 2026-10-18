'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ProjectOutlined, StarOutlined } from '@ant-design/icons';
import { useProjects } from '@/lib/queries';
import { readPref, writePref } from '@/lib/prefs';
import { activeHref, type NavItem, type NavSection } from './nav';

const RECENT_MAX = 6;
const PROJECT_PAGE = /^\/projects\/([\w-]+)$/;

/** A page opened lately, for Search (Ctrl K) before anything is typed. */
export interface RecentPage {
  item: NavItem;
  at: number;
}

/** The page a path can be pinned as: a sidebar page itself, or one project's page. */
export function pinnableHref(sections: NavSection[], pathname: string): string | null {
  if (PROJECT_PAGE.test(pathname)) return pathname;
  const href = activeHref(pathname);
  return pathname === href && href !== '/' && sections.some((s) => s.items.some((i) => i.href === href)) ? href : null;
}

/** Earlier builds kept bare addresses; they read as opened long ago. */
const readRecent = (key: string): { href: string; at: number }[] =>
  readPref<unknown[]>(key, [])
    .map((r) => (typeof r === 'string' ? { href: r, at: 0 } : (r as { href: string; at: number })))
    .filter((r) => r && typeof r.href === 'string');

/**
 * Favourites (pages and projects starred from the header) as a sidebar section, and the pages opened lately for Search
 * (Ctrl K), kept per user on this browser (UX item 87 moved Recent out of the sidebar). Both only hold links the user can
 * still open: pages from their own sidebar and projects they still see.
 */
export function usePins(userId: string, sections: NavSection[]) {
  const pathname = usePathname();
  const favKey = `nirmaan.favourites.${userId}`;
  const recentKey = `nirmaan.recent.${userId}`;
  const [favourites, setFavourites] = useState<string[]>(() => readPref<string[]>(favKey, []));
  const [recent, setRecent] = useState<{ href: string; at: number }[]>(() => readRecent(recentKey));
  const { data: projects } = useProjects();

  const current = pinnableHref(sections, pathname);
  useEffect(() => {
    if (!current) return;
    setRecent((old) => {
      const next = [{ href: current, at: Date.now() }, ...old.filter((r) => r.href !== current)].slice(0, RECENT_MAX + 1);
      writePref(recentKey, next);
      return next;
    });
  }, [current, recentKey]);

  const toggleFavourite = useCallback(
    (href: string) =>
      setFavourites((old) => {
        const next = old.includes(href) ? old.filter((h) => h !== href) : [...old, href];
        writePref(favKey, next);
        return next;
      }),
    [favKey],
  );

  const toItem = useMemo(() => {
    const pages = new Map(sections.flatMap((s) => s.items.map((i) => [i.href, i] as const)));
    return (href: string): NavItem | null => {
      const project = href.match(PROJECT_PAGE);
      if (project) {
        const p = projects?.find((x) => x.id === project[1]);
        return p ? { href, label: p.name, icon: ProjectOutlined } : null;
      }
      return pages.get(href) ?? null;
    };
  }, [sections, projects]);

  const pinSections = useMemo<NavSection[]>(() => {
    const fav = favourites.map(toItem).filter((i): i is NavItem => !!i);
    return fav.length ? [{ key: 'favourites', title: 'Favourites', icon: StarOutlined, items: fav, exact: true }] : [];
  }, [favourites, toItem]);

  // Not the page you are on (nor its sidebar page).
  const here = activeHref(pathname);
  const recentPages = useMemo<RecentPage[]>(
    () =>
      recent
        .filter((r) => r.href !== pathname && r.href !== here)
        .map((r) => ({ item: toItem(r.href), at: r.at }))
        .filter((r): r is RecentPage => !!r.item)
        .slice(0, RECENT_MAX),
    [recent, pathname, here, toItem],
  );

  return { current, isFavourite: !!current && favourites.includes(current), toggleFavourite, pinSections, recentPages };
}
