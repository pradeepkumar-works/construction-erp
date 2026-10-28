/**
 * The launcher Home (phase 2, ARCHITECTURE "Launcher Home"): pins and Recent, kept per user on the server so they follow
 * them to every browser and the phone. The tiles themselves come from the navigation tree (`navigation.ts`).
 */
import type { AccessRequestStatus, NavPinKind, NavVisitKind, RoleKey, SubmissionType } from './enums';
import { NAV_TREE, canSeeNav, type NavNode, type NavUser } from './navigation';
import { pathIsOff } from './module-switches';

/** Pinned holds at most this many. */
export const LAUNCHER_PIN_MAX = 12;
/** Recent on Home shows this many places. */
export const LAUNCHER_RECENT_SHOWN = 5;
/** Project and record visits kept per user (node visits are all kept: Discover reads "never opened" from them). */
export const LAUNCHER_VISITS_KEPT = 30;
/** The same place is counted again only after this long. */
export const LAUNCHER_VISIT_GAP_MS = 10_000;

export interface NavPinDto {
  id: string;
  kind: NavPinKind;
  /** A node id or a project id. */
  target: string;
  label: string;
  /** Pins sort by this as plain text (`positionBetween`). */
  position: string;
}

export interface NavVisitDto {
  kind: NavVisitKind;
  target: string;
  label: string;
  href: string;
  lastAt: string;
}

/** A company's own say on a node's New and Featured marks (Admin › Home tiles); `null` keeps the tree's default. */
export interface LauncherFlagDto {
  nodeId: string;
  isNew: boolean | null;
  /** With `isNew`, the last day it shows as New (none: until turned off). */
  newUntil: string | null;
  featured: boolean | null;
}

/** The caller's own latest request for a module, so Discover can say it is waiting or was answered. */
export interface MyAccessRequestDto {
  id: string;
  nodeId: string;
  status: AccessRequestStatus;
  reply: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** A request for access, as an admin sees it in Admin › Home tiles. */
export interface AccessRequestDto extends MyAccessRequestDto {
  nodeLabel: string;
  userId: string;
  userName: string;
  roleKey: RoleKey;
  note: string | null;
  decidedByName: string | null;
}

/** `GET /launcher`: everything Home needs from the server, in one call. */
export interface LauncherDto {
  pins: NavPinDto[];
  /** Newest first. */
  recent: NavVisitDto[];
  /** Phase 3: the company's New and Featured marks. */
  flags: LauncherFlagDto[];
  /** Home's tiles (top-level node ids) the user has opened at least once, from their visits. */
  opened: string[];
  /** The user's latest request for each module. */
  requests: MyAccessRequestDto[];
  /** Discover also shows modules the user's role cannot open, greyed, with Request access (on unless an admin turns it off). */
  discoverLocked: boolean;
  /** The web app's address, for the phone to open a page it has no screen of (phase 4); null when not configured. */
  webUrl: string | null;
}

/** `GET /launcher/home-tiles`: Admin › Home tiles. */
export interface HomeTilesDto {
  flags: LauncherFlagDto[];
  discoverLocked: boolean;
  /** Waiting ones first, then the latest answered. */
  requests: AccessRequestDto[];
}

/** `GET /launcher/badges`: counts waiting on the user, by node id. Only nodes with something waiting are listed. */
export interface LauncherBadgesDto {
  nodes: Record<string, number>;
  /** The approvals waiting on the user by type, so a module of the company's menu counts its own (`menuWaiting`) */
  approvals?: { type: SubmissionType; count: number }[];
}

/** `POST /launcher/import`: the old Home's favourites and recent pages from one browser, sent once. */
export interface LauncherImportDto {
  pins: { kind: NavPinKind; target: string; label: string }[];
  visits: { kind: NavVisitKind; target: string; label: string; href: string; at: number }[];
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const digit = (s: string, i: number) => DIGITS.indexOf(s[i]);

/**
 * A position that sorts between `before` and `after` (either may be missing), so moving a pin rewrites only that pin.
 * Positions use 0-9 and a-z, compared as plain text, and never end in 0, so there is always room between two of them.
 */
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new Error(`positionBetween: ${before} is not before ${after}`);
  let out = '';
  let lower = before !== null;
  let upper = after !== null;
  for (let i = 0; ; i++) {
    const lo = lower && i < before!.length ? digit(before!, i) : 0;
    const hi = upper && i < after!.length ? digit(after!, i) : DIGITS.length;
    if (hi - lo > 1) return out + DIGITS[Math.floor((lo + hi) / 2)];
    out += DIGITS[lo];
    if (lo < hi) upper = false;
    if (!lower || i >= before!.length) lower = false;
  }
}

/** Pins in their order. */
export const byPosition = <T extends { position: string }>(pins: T[]): T[] => [...pins].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

/** Discover on Home shows at most this many tiles. */
export const DISCOVER_SHOWN = 6;
/** Of those, at most this many are modules the user can open but never has; the rest go to New, Featured and locked ones. */
const DISCOVER_UNOPENED = 3;
/** Slots kept, when there are any, for modules the role cannot open, so New and Featured never push them all out. */
const DISCOVER_LOCKED_KEPT = 1;

/** Why a tile is in Discover. */
export type DiscoverReason = 'new' | 'featured' | 'unopened' | 'locked';

export interface DiscoverEntry {
  node: NavNode;
  reason: DiscoverReason;
  /** The user's role cannot open it: the tile offers Request access instead of Open. */
  locked: boolean;
  request?: MyAccessRequestDto;
}

/** Whether a node shows as New and as Featured on `today`: the company's mark if it set one, else the tree's default. */
export function launcherMarks(node: NavNode, flag: LauncherFlagDto | undefined, today: string): { isNew: boolean; featured: boolean } {
  const isNew = flag && flag.isNew !== null ? flag.isNew && (!flag.newUntil || today <= flag.newUntil) : !!node.newUntil && today <= node.newUntil;
  return { isNew, featured: flag && flag.featured !== null ? flag.featured : !!node.featured };
}

/** Home's tiles that Discover and Admin › Home tiles deal with: every top-level tile but My work. */
export const LAUNCHER_FLAG_NODES: NavNode[] = NAV_TREE.filter((n) => n.parent === null && n.tile !== false && n.status === 'live' && n.id !== 'my-work');

/** A module some of whose pages the company has not turned off (v6 item 117), whoever may open them. */
export function navModuleOn(node: NavNode, modulesOff: readonly string[] | undefined): boolean {
  const under = (id: string): boolean =>
    NAV_TREE.some((c) => c.parent === id && c.status === 'live' && !c.shortcutOf && ((c.route ? !pathIsOff(c.route, modulesOff) : !!c.projectTab) || under(c.id)));
  return under(node.id);
}

/** A module the user's role cannot open, that they could ask for: on for the company, and not Admin itself. */
export const canRequestNav = (user: NavUser, node: NavNode): boolean =>
  node.parent === null && !node.route && node.id !== 'admin' && node.status === 'live' && !canSeeNav(user, node) && navModuleOn(node, user.modulesOff);

/**
 * Discover on Home (launcher phase 3): modules marked New (until the user opens them) or Featured, then modules the user
 * can open but never has, then, when the company allows it, modules their role cannot open, greyed with Request access.
 * At most `DISCOVER_SHOWN`, each kind in the tree's order; one place is kept for a module to ask for when there is one.
 */
export function discoverFor(user: NavUser, launcher: Pick<LauncherDto, 'flags' | 'opened' | 'requests' | 'discoverLocked'>, today: string): DiscoverEntry[] {
  const flags = new Map(launcher.flags.map((f) => [f.nodeId, f]));
  const opened = new Set(launcher.opened);
  const requests = new Map(launcher.requests.map((r) => [r.nodeId, r]));
  const marked: DiscoverEntry[] = [];
  const unopened: DiscoverEntry[] = [];
  const locked: DiscoverEntry[] = [];
  for (const node of LAUNCHER_FLAG_NODES) {
    const visible = canSeeNav(user, node);
    const askable = !visible && launcher.discoverLocked && canRequestNav(user, node);
    if (!visible && !askable) continue;
    const { isNew, featured } = launcherMarks(node, flags.get(node.id), today);
    const entry = (reason: DiscoverReason): DiscoverEntry => ({ node, reason, locked: !visible, request: requests.get(node.id) });
    if (isNew && !opened.has(node.id)) marked.push(entry('new'));
    else if (featured) marked.push(entry('featured'));
    else if (!visible) locked.push(entry('locked'));
    else if (!opened.has(node.id)) unopened.push(entry('unopened'));
  }
  marked.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'new' ? -1 : 1));
  const room = DISCOVER_SHOWN - marked.length - Math.min(locked.length, DISCOVER_LOCKED_KEPT);
  const first = Math.max(0, Math.min(DISCOVER_UNOPENED, room));
  return [...marked, ...unopened.slice(0, first), ...locked, ...unopened.slice(first)].slice(0, DISCOVER_SHOWN);
}

/** The top-level tile a node is under (itself, for a module), for counting a visit to any page as opening its module. */
export function navRootOf(id: string): string | undefined {
  let node = NAV_TREE.find((n) => n.id === id);
  while (node && node.parent !== null) {
    const parent = node.parent;
    node = NAV_TREE.find((n) => n.id === parent);
  }
  return node?.id;
}
