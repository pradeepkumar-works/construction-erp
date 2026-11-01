#!/usr/bin/env node
/**
 * Every <Text> caps how far the phone's font size can grow (CLAUDE.md, Mobile theme): it carries
 * maxFontSizeMultiplier={maxFontScale} from src/theme.ts.
 *
 *   node scripts/cap-text-scale.mjs          add the prop (and the theme import) where it is missing
 *   node scripts/cap-text-scale.mjs --check  list the places and fail, changing nothing
 *
 * src/launcher is left out: another owner keeps it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THEME = path.join(ROOT, 'src', 'theme');
const SKIP = [path.join(ROOT, 'src', 'launcher')];
const check = process.argv.includes('--check');

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.some((s) => p.startsWith(s))) continue;
    if (e.isDirectory()) out.push(...files(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Index just past the `>` that closes the JSX opening tag starting at `from`, skipping braces and strings. */
function tagEnd(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i + 1;
  }
  return -1;
}

/** Positions just after `<Text` of every opening tag that has no maxFontSizeMultiplier. */
function uncapped(src) {
  const at = [];
  const re = /<Text(?=[\s>/])/g;
  let m;
  while ((m = re.exec(src))) {
    const end = tagEnd(src, m.index + 5);
    if (end < 0) continue;
    if (!src.slice(m.index, end).includes('maxFontSizeMultiplier')) at.push(m.index + 5);
  }
  return at;
}

function withThemeImport(src, file) {
  const themeImport = /import\s*\{([^}]*)\}\s*from\s*'([^']*\/theme)';/;
  const m = src.match(themeImport);
  if (m) {
    if (/\bmaxFontScale\b/.test(m[1])) return src;
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    names.push('maxFontScale');
    names.sort((a, b) => a.replace(/^type /, '').localeCompare(b.replace(/^type /, ''), 'en', { sensitivity: 'base' }));
    return src.replace(themeImport, `import { ${names.join(', ')} } from '${m[2]}';`);
  }
  let rel = path.relative(path.dirname(file), THEME).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const line = `import { maxFontScale } from '${rel}';\n`;
  const imports = [...src.matchAll(/^import [^;]*;\n/gms)];
  const last = imports[imports.length - 1];
  const at = last ? last.index + last[0].length : 0;
  return src.slice(0, at) + line + src.slice(at);
}

let places = 0;
let changed = 0;
for (const file of [...files(path.join(ROOT, 'app')), ...files(path.join(ROOT, 'src'))]) {
  const src = fs.readFileSync(file, 'utf8');
  const at = uncapped(src);
  if (!at.length) continue;
  places += at.length;
  const rel = path.relative(ROOT, file);
  if (check) {
    for (const i of at) console.log(`${rel}:${src.slice(0, i).split('\n').length} <Text> without maxFontSizeMultiplier`);
    continue;
  }
  let out = src;
  for (const i of [...at].reverse()) out = `${out.slice(0, i)} maxFontSizeMultiplier={maxFontScale}${out.slice(i)}`;
  out = withThemeImport(out, file);
  fs.writeFileSync(file, out);
  changed++;
}

if (check) {
  console.log(places ? `${places} <Text> without a cap` : 'every <Text> caps its growth');
  process.exit(places ? 1 : 0);
}
console.log(`capped ${places} <Text> in ${changed} files`);
