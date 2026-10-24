/**
 * The sidebar's sections and links, filtered to what the signed-in user may open, drawn from the navigation tree
 * (`NAV_TREE` in `@erp/shared`): each module on Home is a section, its pages are the links. The sidebar, its collapsed rail,
 * the header's breadcrumb and quick-jump search all read from here, so a new page is one node in the tree.
 */
import type React from 'react';
import { AppstoreOutlined, AuditOutlined, ContactsOutlined, ContainerOutlined, FileTextOutlined, ProjectOutlined, QuestionCircleOutlined, WalletOutlined } from '@/components/common/icons';
import type { AuthUser, ModuleKey, NavNode, NavSidebarLink } from '@erp/shared';
import { isGuest, isModuleKey, isSupplier, navSidebar } from '@erp/shared';
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
  // A supplier's login has the supplier portal only (v6 item 105).
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
  return navSidebar(user).map((sec) => ({
    key: sec.key,
    title: sec.module?.label,
    icon: sec.module && navIcon(sec.module.icon),
    module: sec.module && isModuleKey(sec.module.id) ? sec.module.id : undefined,
    items: sec.links.map((l) => ({
      href: l.href,
      label: l.label,
      icon: iconOf(l),
      keywords: l.overview ? `module home summary dashboard ${l.node.keywords ?? ''}`.trim() : l.node.keywords,
      approvals: l.node.badge === 'approvals' || undefined,
      overview: l.overview,
      node: l.node,
    })),
  }));
}

/** The nav link a path belongs to: "/" only for the dashboard, otherwise the link whose path is the first segment. */
export function activeHref(pathname: string): string {
  if (pathname === '/') return '/';
  const [, first, second] = pathname.split('/');
  // A module's screen is /modules/<key>: the link is the whole path.
  if (first === 'modules' && second) return `/modules/${second}`;
  // The supplier portal's pages are each a link of their own (v6 item 105).
  if (first === 'supplier' && second) return `/supplier/${second}`;
  return '/' + first;
}

/** Where a path sits in the sidebar, for the header: the section's title (none for the top links) and the link. */
export function navTrail(sections: NavSection[], pathname: string): { section?: string; item: NavItem } | null {
  const href = activeHref(pathname);
  for (const s of sections) {
    const item = s.items.find((i) => i.href === href);
    if (item) return { section: s.title, item };
  }
  return null;
}
