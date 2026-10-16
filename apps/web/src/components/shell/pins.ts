'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HistoryOutlined, ProjectOutlined, StarOutlined } from '@ant-design/icons';
import { useProjects } from '@/lib/queries';
import { readPref, writePref } from '@/lib/prefs';
import { activeHref, type NavItem, type NavSection } from './nav';

const RECENT_MAX = 5;
const PROJECT_PAGE = /^\/projects\/([\w-]+)$/;

/** The page a path can be pinned as: a sidebar page itself, or one project's page. */
export function pinnableHref(sections: NavSection[], pathname: string): string | null {
  if (PROJECT_PAGE.test(pathname)) return pathname;
  const href = activeHref(pathname);
  return pathname === href && href !== '/' && sections.some((s) => s.items.some((i) => i.href === href)) ? href : null;
}

/**
 * Favourites (pages and projects starred from the header) and Recent (the last few opened), kept per user on this
 * browser, as sidebar sections. Both only hold links the user can still open: pages from their own sidebar and
 * projects they still see.
 */
export function usePins(userId: string, sections: NavSection[]) {
  const pathname = usePathname();
  const favKey = `nirmaan.favourites.${userId}`;
  const recentKey = `nirmaan.recent.${userId}`;
  const [favourites, setFavourites] = useState<string[]>(() => readPref<string[]>(favKey, []));
  const [recent, setRecent] = useState<string[]>(() => readPref<string[]>(recentKey, []));
  const { data: projects } = useProjects();

  const current = pinnableHref(sections, pathname);
  useEffect(() => {
    if (!current) return;
    setRecent((old) => {
      const next = [current, ...old.filter((h) => h !== current)].slice(0, RECENT_MAX + 1);
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

  const pinSections = useMemo<NavSection[]>(() => {
    const pages = new Map(sections.flatMap((s) => s.items.map((i) => [i.href, i] as const)));
    const toItem = (href: string): NavItem | null => {
      const project = href.match(PROJECT_PAGE);
      if (project) {
        const p = projects?.find((x) => x.id === project[1]);
        return p ? { href, label: p.name, icon: ProjectOutlined } : null;
      }
      return pages.get(href) ?? null;
    };
    const fav = favourites.map(toItem).filter((i): i is NavItem => !!i);
    // Not the page you are on (nor its sidebar page), nor what is already a favourite.
    const here = activeHref(pathname);
    const rec = recent
      .filter((h) => h !== pathname && h !== here && !favourites.includes(h))
      .map(toItem)
      .filter((i): i is NavItem => !!i)
      .slice(0, RECENT_MAX);
    return [
      ...(fav.length ? [{ key: 'favourites', title: 'Favourites', icon: StarOutlined, items: fav, exact: true }] : []),
      ...(rec.length ? [{ key: 'recent', title: 'Recent', icon: HistoryOutlined, items: rec, exact: true }] : []),
    ];
  }, [sections, projects, favourites, recent, pathname]);

  return { current, isFavourite: !!current && favourites.includes(current), toggleFavourite, pinSections };
}
