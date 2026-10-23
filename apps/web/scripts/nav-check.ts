/**
 * Checks the navigation tree (`NAV_TREE` in `@erp/shared`) against the app, so a tile never leads nowhere. CI runs it:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json scripts/nav-check.ts
 * - ids are unique, parents exist, and every module on Home without a route is a `MODULE_KEYS` key (and back);
 * - every access key has its check in `NAV_ACCESS`, and every icon is in `NAV_ICONS` (`components/shell/nav-icons.tsx`);
 * - a live node opens something: a route that is a page of the app, a tab of the project page, or a live node it is a
 *   shortcut of; a live module has a live page;
 * - every Concord brochure item (`concord-items.ts`) has its node, which lists it, or says why it is not a tile;
 * - the phone (launcher phase 4): every icon is in its `NAV_ICONS` too (`apps/mobile/src/components/NavIcon.tsx`), and each
 *   of its `PHONE_ROUTES` is a live node and a screen of the phone app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MODULE_KEYS, NAV_ACCESS, NAV_TREE, navNode } from '@erp/shared';
import { NAV_ICONS } from '../src/components/shell/nav-icons';
import { CONCORD_ITEMS } from './concord-items';
import { PHONE_ROUTES } from '../../mobile/src/launcher/routes';

const APP = path.resolve(__dirname, '../src/app');
const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

/** Every page's path in the app router, route groups left out and dynamic segments as `*`. */
function appRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, segs: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const seg = /^\(.*\)$/.test(e.name) ? null : /^\[.*\]$/.test(e.name) ? '*' : e.name;
        walk(path.join(dir, e.name), seg ? [...segs, seg] : segs);
      } else if (/^page\.tsx?$/.test(e.name)) out.push('/' + segs.join('/'));
    }
  };
  walk(APP, []);
  return out;
}
const routes = appRoutes();
const isPage = (pathname: string) => routes.some((r) => r === pathname || (r.includes('*') && new RegExp(`^${r.replace(/\*/g, '[^/]+')}$`).test(pathname)));
const projectTabs = new Set([...fs.readFileSync(path.join(APP, '(app)/projects/[id]/page.tsx'), 'utf8').matchAll(/\{\s*key:\s*'([\w-]+)',\s*group:/g)].map((m) => m[1]));

/** The phone's screens (expo-router), as for the web; and the icons its `NAV_ICONS` maps. */
const PHONE_APP = path.resolve(__dirname, '../../mobile/app');
const phoneRoutes: string[] = [];
const walkPhone = (dir: string, segs: string[]) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const seg = /^\(.*\)$/.test(e.name) ? null : /^\[.*\]$/.test(e.name) ? '*' : e.name;
      walkPhone(path.join(dir, e.name), seg ? [...segs, seg] : segs);
    } else if (/\.tsx$/.test(e.name) && !e.name.startsWith('_')) {
      const name = e.name.replace(/\.tsx$/, '');
      phoneRoutes.push('/' + [...segs, ...(name === 'index' ? [] : [/^\[.*\]$/.test(name) ? '*' : name])].join('/'));
    }
  }
};
walkPhone(PHONE_APP, []);
const phoneIcons = new Set([...fs.readFileSync(path.resolve(__dirname, '../../mobile/src/components/NavIcon.tsx'), 'utf8').matchAll(/^\s*'([\w-]+)':/gm)].map((m) => m[1]));
for (const [id, to] of Object.entries(PHONE_ROUTES)) {
  const n = navNode(id);
  if (!n || n.status !== 'live') fail(`PHONE_ROUTES ${id}: not a live node of the tree`);
  if (!phoneRoutes.includes(to.split('?')[0])) fail(`PHONE_ROUTES ${id}: ${to} is not a screen of the phone app`);
}

const ids = new Set<string>();
for (const n of NAV_TREE) {
  if (ids.has(n.id)) fail(`${n.id}: the id is used twice`);
  ids.add(n.id);
}
for (const n of NAV_TREE) {
  const at = n.id;
  if (n.parent && !navNode(n.parent)) fail(`${at}: parent ${n.parent} is not in the tree`);
  if (n.parent && navNode(n.parent)?.parent) fail(`${at}: tiles go two levels deep at most (Home, then a module)`);
  if (!(n.access in NAV_ACCESS)) fail(`${at}: access '${n.access}' has no check in NAV_ACCESS`);
  if (!NAV_ICONS[n.icon]) fail(`${at}: icon '${n.icon}' is not in NAV_ICONS (components/shell/nav-icons.tsx)`);
  if (!phoneIcons.has(n.icon)) fail(`${at}: icon '${n.icon}' is not in the phone's NAV_ICONS (apps/mobile/src/components/NavIcon.tsx)`);
  if (n.status !== 'live') {
    if (!n.roadmap && n.status === 'building') fail(`${at}: a building node names its roadmap item`);
    continue;
  }
  if (n.shortcutOf) {
    const target = navNode(n.shortcutOf);
    if (!target) fail(`${at}: shortcut of ${n.shortcutOf}, which is not in the tree`);
    else if (target.shortcutOf) fail(`${at}: shortcut of a shortcut (${n.shortcutOf})`);
    else if (target.status !== 'live') fail(`${at}: live, but ${n.shortcutOf} is not`);
    continue;
  }
  if (n.route) {
    const pathname = n.route.split('?')[0];
    if (!isPage(pathname)) fail(`${at}: ${n.route} is not a page of the app`);
  } else if (n.projectTab) {
    if (!projectTabs.has(n.projectTab)) fail(`${at}: ?tab=${n.projectTab} is not a tab of the project page`);
  } else if (n.parent) fail(`${at}: a live page needs a route, a projectTab or shortcutOf`);
  else if (!NAV_TREE.some((c) => c.parent === n.id && c.status === 'live')) fail(`${at}: a live module needs a live page`);
}

const modules = NAV_TREE.filter((n) => n.parent === null && !n.route && n.status === 'live').map((n) => n.id);
for (const k of modules) if (!(MODULE_KEYS as readonly string[]).includes(k)) fail(`module ${k}: add it to MODULE_KEYS (packages/shared/src/modules.ts)`);
for (const k of MODULE_KEYS) if (!modules.includes(k)) fail(`MODULE_KEYS has ${k}, which is not a live module of the tree`);

const items = new Set(CONCORD_ITEMS.map((c) => c.id));
for (const c of CONCORD_ITEMS) {
  const ways = [c.node, c.notTile, c.gap].filter(Boolean).length;
  if (ways !== 1) fail(`Concord ${c.id}: give it exactly one of node, notTile or gap`);
  if (c.node) {
    const n = navNode(c.node);
    if (!n) fail(`Concord ${c.id} (${c.item}): node ${c.node} is not in the tree`);
    else if (!n.concord?.includes(c.id)) fail(`Concord ${c.id} (${c.item}): ${c.node} does not list it in concord`);
  }
}
for (const n of NAV_TREE) for (const c of n.concord ?? []) if (!items.has(c)) fail(`${n.id}: concord '${c}' is not in concord-items.ts`);

const live = NAV_TREE.filter((n) => n.status === 'live').length;
if (problems.length) {
  console.error(`Navigation tree: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`Navigation tree: ${NAV_TREE.length} nodes (${live} live), ${modules.length} modules, ${CONCORD_ITEMS.length} Concord items placed. All good.`);
