// Lists Hindi keys removed since a git ref that a source file still names as a string, so a rename never strips the
// Hindi of text still shown through a map or a prop (i18n:check sees only literal t() calls).
// Run: node scripts/removed-hindi.mjs [ref, default origin/main]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ref = process.argv[2] ?? 'origin/main';
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const str = String.raw`(['"\x60])((?:\\.|(?!\1).)*)\1`;
const entry = new RegExp(String.raw`^\s*(?:${str}|([A-Za-z_]\w*))\s*:\s*${str.replaceAll('\\1', '\\4')}\s*,?\s*$`, 'gm');
const unquote = (q, s) => (q === "'" ? s.replace(/\\'/g, "'") : q === '"' ? s.replace(/\\"/g, '"') : s).replace(/\\\\/g, '\\');
const keys = (text) => new Set([...text.matchAll(entry)].map((m) => m[3] ?? unquote(m[1], m[2])));

const files = walk(join(root, 'src/i18n/hi')).filter((f) => !f.endsWith('index.ts'));
const now = new Set(files.flatMap((f) => [...keys(readFileSync(f, 'utf8'))]));
const before = new Set();
for (const f of files) {
  const rel = `apps/mobile/${f.slice(root.length)}`;
  try {
    for (const k of keys(execFileSync('git', ['show', `${ref}:${rel}`], { encoding: 'utf8' }))) before.add(k);
  } catch {
    // A file new since the ref.
  }
}
const used = new Set();
for (const file of [...walk(join(root, 'app')), ...walk(join(root, 'src'))].filter((f) => /\.tsx?$/.test(f) && !f.includes('/i18n/hi/'))) {
  const text = readFileSync(file, 'utf8');
  for (const q of ["'", '"', '`']) for (const m of text.matchAll(new RegExp(String.raw`${q}((?:\\.|[^${q}\\\n])*)${q}`, 'g'))) used.add(unquote(q, m[1]));
}
const lost = [...before].filter((k) => !now.has(k) && used.has(k));
for (const k of lost) console.log(`removed but still named: "${k}"`);
console.log(`${before.size - [...before].filter((k) => now.has(k)).length} keys removed since ${ref}, ${lost.length} still named`);
process.exit(lost.length ? 1 : 0);
