import { useMemo } from 'react';
import { isGuest, isSupplier, menuWaiting, navMenuFor, navNode, navSettingsOf, navTarget, type AuthUser, type NavMenuModule, type NavNode } from '@erp/shared';
import type { Launcher } from '../launcher/useLauncher';

/** One icon of Home's menu: a page of the tree (My work, a pin) or a module of the company's menu. */
export type MenuItem = { kind: 'node'; key: string; node: NavNode; badge?: number } | { kind: 'module'; key: string; module: NavMenuModule; badge?: number };

/**
 * Home's menu on the phone (ARCHITECTURE "The launcher on the phone"): My work, then the user's pins, then the modules of
 * the company's menu in its set and under its names (`navMenuFor`, as the web's top bar and Home), each with what waits
 * in it (`menuWaiting`). A pin that is one of the modules shown is not drawn twice.
 */
export function useHomeMenu(user: AuthUser | null, launcher: Pick<Launcher, 'pins' | 'badges' | 'approvals'>): MenuItem[] {
  const { pins, badges, approvals } = launcher;
  return useMemo(() => {
    if (!user || isGuest(user.roleKey) || isSupplier(user.roleKey)) return [];
    const menu = navMenuFor(user, navSettingsOf(user));
    const waiting = menuWaiting(menu, approvals, badges);
    const moduleKeys = new Set(menu.map((m) => m.key));
    const items: MenuItem[] = [];
    const myWork = navNode('my-work');
    if (myWork) items.push({ kind: 'node', key: myWork.id, node: myWork, badge: badges[myWork.id] });
    for (const p of pins) {
      const node = p.kind === 'NODE' ? navNode(p.target) : undefined;
      if (!node || node.id === 'my-work' || moduleKeys.has(navTarget(node).id)) continue;
      items.push({ kind: 'node', key: `pin-${p.id}`, node, badge: badges[navTarget(node).id] });
    }
    for (const m of menu) items.push({ kind: 'module', key: m.key, module: m, badge: waiting[m.key] });
    return items;
  }, [user, pins, badges, approvals]);
}
