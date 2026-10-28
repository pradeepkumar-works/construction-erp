import type { NavMenuModule, NavNode } from '@erp/shared';

/** A page found by Search: the node and the module of the company's menu it sits in. */
export interface FoundPage {
  node: NavNode;
  module: NavMenuModule;
}

/** Every page of the user's menu once, in the menu's order, with the first module it sits in. */
export function menuPages(menu: NavMenuModule[]): FoundPage[] {
  const seen = new Set<string>();
  const out: FoundPage[] = [];
  for (const module of menu)
    for (const sub of module.subs)
      for (const node of sub.nodes) {
        const id = node.shortcutOf ?? node.id;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ node, module });
      }
  return out;
}

/**
 * Search on the phone (Home's search icon): the modules and pages of the user's menu whose name, in English or in the
 * app's language (`label`), its words or its line match every word typed. Names that start with the words come first.
 */
export function findInMenu(menu: NavMenuModule[], query: string, label: (en: string) => string): { modules: NavMenuModule[]; pages: FoundPage[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { modules: [], pages: [] };
  const hay = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ').toLowerCase();
  const all = (text: string) => words.every((w) => text.includes(w));
  const starts = (name: string) => name.toLowerCase().startsWith(words[0]);
  const modules = menu.filter((m) => all(hay(m.label, label(m.label), m.defaultLabel, m.description)));
  const pages = menuPages(menu).filter((p) => all(hay(p.node.label, label(p.node.label), p.node.keywords, p.node.description, p.module.label)));
  const first = <T,>(name: (x: T) => string) => (a: T, b: T) => Number(starts(name(b))) - Number(starts(name(a)));
  return { modules: [...modules].sort(first((m) => m.label)), pages: [...pages].sort(first((p) => p.node.label)) };
}
