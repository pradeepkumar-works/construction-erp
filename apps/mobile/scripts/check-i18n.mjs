// Lists English text passed to t() with no Hindi, keys whose Hindi differs between files, and translations whose
// {placeholders} do not match the English (v4 item 49). Run: npm run i18n:check
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const unquote = (q, s) => (q === "'" ? s.replace(/\\'/g, "'") : q === '"' ? s.replace(/\\"/g, '"') : s).replace(/\\\\/g, '\\');
const str = String.raw`(['"\x60])((?:\\.|(?!\1).)*)\1`;

const dict = new Map();
const problems = [];
for (const file of walk(join(root, 'src/i18n/hi')).filter((f) => !f.endsWith('index.ts'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(new RegExp(String.raw`^\s*(?:${str}|([A-Za-z_]\w*))\s*:\s*${str.replaceAll('\\1', '\\4')}\s*,?\s*$`, 'gm'))) {
    const en = m[3] ?? unquote(m[1], m[2]);
    const hi = unquote(m[4], m[5]);
    const prev = dict.get(en);
    if (prev && prev.hi !== hi) problems.push(`different Hindi for "${en}" in ${prev.file} and ${file.replace(root, '')}`);
    dict.set(en, { hi, file: file.replace(root, '') });
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(',');
    if (ph(en) !== ph(hi)) problems.push(`placeholders differ for "${en}"`);
  }
}

const missing = new Map();
for (const file of [...walk(join(root, 'app')), ...walk(join(root, 'src'))].filter((f) => /\.tsx?$/.test(f) && !f.includes('/i18n/'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(new RegExp(String.raw`\bt\(\s*${str}`, 'g'))) {
    if (m[1] === '`' && m[2].includes('${')) {
      problems.push(`template literal in t() at ${file.replace(root, '')}: use {placeholders}`);
      continue;
    }
    const en = unquote(m[1], m[2]);
    if (!dict.has(en)) missing.set(en, file.replace(root, ''));
  }
}

// The navigation tree's names, descriptions and groups reach t() as values (Home's tiles, the module screens, launcher phase 4).
const { NAV_TREE, AREA_MODULES, DEPARTMENT_MODULES, HOME_TABS } = await import('@erp/shared');
for (const n of NAV_TREE.filter((x) => x.status === 'live')) {
  for (const en of [n.label, n.description, n.group, typeof n.nav === 'string' ? n.nav : undefined]) if (en && !dict.has(en)) missing.set(en, `NAV_TREE ${n.id}`);
}
// The menu's modules (Menu and names): Home's icons, Search and a module's screen show their names, lines and sub-modules.
for (const m of [...AREA_MODULES, ...DEPARTMENT_MODULES]) {
  for (const en of [m.label, m.description, ...m.subs.map((s) => s.label)]) if (en && !dict.has(en)) missing.set(en, `menu module ${m.key}`);
}

// Home's tabs over the menu.
for (const tab of HOME_TABS) if (!dict.has(tab.label)) missing.set(tab.label, `HOME_TABS ${tab.key}`);

for (const [en, file] of missing) console.log(`no Hindi: "${en}" (${file})`);
for (const p of problems) console.log(p);
console.log(`${dict.size} Hindi strings, ${missing.size} missing, ${problems.length} other problems`);
process.exit(missing.size || problems.length ? 1 : 0);
