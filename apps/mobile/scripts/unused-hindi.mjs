// Lists Hindi keys that no source file of the app names as a string and no @erp/shared export holds, so a renamed
// English string does not leave its old key behind. Run: node scripts/unused-hindi.mjs [--delete]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const unquote = (q, s) => (q === "'" ? s.replace(/\\'/g, "'") : q === '"' ? s.replace(/\\"/g, '"') : s).replace(/\\\\/g, '\\');
const str = String.raw`(['"\x60])((?:\\.|(?!\1).)*)\1`;
const entry = new RegExp(String.raw`^\s*(?:${str}|([A-Za-z_]\w*))\s*:\s*${str.replaceAll('\\1', '\\4')}\s*,?\s*$`);

const used = new Set();
for (const file of [...walk(join(root, 'app')), ...walk(join(root, 'src'))].filter((f) => /\.tsx?$/.test(f) && !f.includes('/i18n/hi/'))) {
  const text = readFileSync(file, 'utf8');
  // Each quote on its own, line by line, so a string inside a template literal or after an apostrophe still counts.
  for (const q of ["'", '"', '`']) for (const m of text.matchAll(new RegExp(String.raw`${q}((?:\\.|[^${q}\\\n])*)${q}`, 'g'))) used.add(unquote(q, m[1]));
}
// Shared labels and server words reach t() as values; their keys belong to whoever owns the label.
const seen = new Set();
const collect = (v) => {
  if (typeof v === 'string') return void used.add(v);
  if (!v || typeof v !== 'object' || seen.has(v)) return;
  seen.add(v);
  for (const x of Object.values(v)) collect(x);
};
collect(await import('@erp/shared'));

const del = process.argv.includes('--delete');
let n = 0;
for (const file of walk(join(root, 'src/i18n/hi')).filter((f) => !f.endsWith('index.ts'))) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const keep = lines.filter((line) => {
    const m = line.match(entry);
    if (!m) return true;
    const en = m[3] ?? unquote(m[1], m[2]);
    if (used.has(en)) return true;
    n++;
    console.log(`${file.replace(root, '')}: "${en}"`);
    return false;
  });
  if (del) writeFileSync(file, keep.join('\n'));
}
console.log(`${n} unused Hindi keys${del ? ' deleted' : ''}`);
