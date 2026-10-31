/**
 * The sidebar's sections and links, filtered to what the signed-in user may open, drawn from the navigation tree
 * (`NAV_TREE` in `@erp/shared`): each module on Home is a section, its pages are the links. The sidebar, its collapsed rail,
 * the header's breadcrumb and quick-jump search all read from here, so a new page is one node in the tree.
 */
import type React from 'react';
import { AppstoreOutlined, AuditOutlined, ContactsOutlined, ContainerOutlined, FileTextOutlined, ProjectOutlined, QuestionCircleOutlined, WalletOutlined } from '@/components/common/icons';
import type { AuthUser, ModuleKey, NavNode, NavSettingsDto, NavSidebarLink } from '@erp/shared';
import { isGuest, isModuleKey, isSupplier, moduleScreenHref, navMenuFor, navPageLink, navSettingsOf, navSidebar } from '@erp/shared';
import { navIcon } from './nav-icons';

export type NavIcon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Other words people search for (abbreviations, the paper form's name). */
  keywords?: string;
  /** Shows the pending-approvals count. */
  approvals?: boolean;
  /** A module's screen (`/modules/<key>`), drawn first in its section. */
  overview?: boolean;
  /** The tree node behind the link (its description is the line on a tile). */
  node?: NavNode;
}

export interface NavSection {
  /** Stable key, used to remember whether the section is open (a module's id). */
  key: string;
  /** No title: the top links, always shown. */
  title?: string;
  /** The section's icon on the collapsed rail. */
  icon?: NavIcon;
  items: NavItem[];
  /** Links light up on their own page only (Favourites, Recent), not on the pages under them. */
  exact?: boolean;
  /** The module this section is: it has a screen at `/modules/<key>`. */
  module?: ModuleKey;
}

const iconOf = (link: NavSidebarLink) => navIcon(link.overview ? 'layout-dashboard' : link.node.icon);

export function navFor(user: AuthUser): NavSection[] {
  // A supplier's login has the supplier portal only.
  if (isSupplier(user.roleKey)) {
    return [
      {
        key: 'top',
        items: [
          { href: '/supplier', label: 'Home', icon: AppstoreOutlined },
          { href: '/supplier/enquiries', label: 'Enquiries', icon: QuestionCircleOutlined, keywords: 'quote rates rfq' },
          { href: '/supplier/orders', label: 'Orders', icon: ContainerOutlined, keywords: 'po work order accept dispatch challan' },
          { href: '/supplier/invoices', label: 'Invoices', icon: FileTextOutlined, keywords: 'bill' },
          { href: '/supplier/statement', label: 'Payments', icon: WalletOutlined, keywords: 'statement ledger due paid tds' },
          { href: '/supplier/profile', label: 'Profile', icon: ContactsOutlined, keywords: 'bank gst details' },
          { href: '/notifications', label: 'Notifications', icon: AuditOutlined },
        ],
      },
    ];
  }
  // The client's engineer and consultant have the portal only.
  if (isGuest(user.roleKey)) {
    return [
      {
        key: 'top',
        items: [
          { href: '/portal', label: 'My projects', icon: ProjectOutlined },
          { href: '/notifications', label: 'Notifications', icon: AuditOutlined },
        ],
      },
    ];
  }
  const settings = navSettingsOf(user);
  const sidebar = navSidebar(user);
  const linkItem = (l: NavSidebarLink, title?: string): NavItem => ({
    href: l.href,
    label: l.overview && title ? `${title} overview` : l.label,
    icon: iconOf(l),
    keywords: l.overview ? `module home summary dashboard ${l.node.keywords ?? ''}`.trim() : l.node.keywords,
    approvals: l.node.badge === 'approvals' || undefined,
    overview: l.overview,
    node: l.node,
  });
  if (settings.moduleSet === 'DEPARTMENTS') return departmentSections(user, settings, sidebar.filter((sec) => !sec.module).map((sec) => ({ key: sec.key, items: sec.links.map((l) => linkItem(l)) })));
  // The tree's own modules, under the company's names.
  return sidebar.map((sec) => {
    const title = sec.module && (settings.names[sec.module.id] || sec.module.label);
    return {
      key: sec.key,
      title,
      icon: sec.module && navIcon(sec.module.icon),
      module: sec.module && isModuleKey(sec.module.id) ? sec.module.id : undefined,
      items: sec.links.map((l) => linkItem(l, title)),
    };
  });
}

/** The department modules (Menu and names): the top links as ever, then each module with its screen and its pages, a page
 *  listed once, under the first module that has it. */
function departmentSections(user: AuthUser, settings: NavSettingsDto, top: NavSection[]): NavSection[] {
  const seen = new Set(top.flatMap((sec) => sec.items.map((i) => i.href)));
  const sections: NavSection[] = [...top];
  for (const m of navMenuFor(user, settings)) {
    const items: NavItem[] = [{ href: moduleScreenHref(m.key), label: `${m.label} overview`, icon: navIcon('layout-dashboard'), keywords: `module home summary ${m.defaultLabel}`, overview: true }];
    for (const n of m.subs.flatMap((x) => x.nodes)) {
      const link = navPageLink(n);
      if (!link || seen.has(link.href)) continue;
      seen.add(link.href);
      items.push({ href: link.href, label: link.label, icon: navIcon(n.icon), keywords: n.keywords, node: n });
    }
    sections.push({ key: m.key, title: m.label, icon: navIcon(m.icon), items });
  }
  return sections;
}

/** The nav link a path belongs to: "/" only for the dashboard, a link of two or more segments that the path is or sits
 *  under (the longest wins, so /correspondence/outward is the Outward register, not the Inward one at /correspondence),
 *  otherwise the link whose path is the first segment. */
export function activeHref(pathname: string, sections: NavSection[] = []): string {
  if (pathname === '/') return '/';
  let nested = '';
  for (const s of sections) {
    for (const { href } of s.items) {
      if (href.split('/').length > 2 && href.length > nested.length && (pathname === href || pathname.startsWith(`${href}/`))) nested = href;
    }
  }
  if (nested) return nested;
  const [, first, second] = pathname.split('/');
  // A module's screen is /modules/<key>: the link is the whole path.
  if (first === 'modules' && second) return `/modules/${second}`;
  // The supplier portal's pages are each a link of their own.
  if (first === 'supplier' && second) return `/supplier/${second}`;
  return '/' + first;
}

/** Where a path sits in the sidebar, for the header: the section's title (none for the top links) and the link. */
export function navTrail(sections: NavSection[], pathname: string): { section?: string; item: NavItem } | null {
  const href = activeHref(pathname, sections);
  for (const s of sections) {
    const item = s.items.find((i) => i.href === href);
    if (item) return { section: s.title, item };
  }
  return null;
}
