/**
 * Checks the design tokens (docs/design/REDESIGN.md). CI runs it:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json scripts/tokens-check.ts
 * - every text role reads at 4.5:1 on every surface it sits on, in both themes, and each tone's text on its own fill;
 * - src/ds/legacy-files.json only shrinks: a listed file that no longer breaks `ds/no-raw-style` must leave the list,
 *   and every listed file must exist;
 * - a CSS file not on the list holds no colour literal and no px size outside 1px lines and media queries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { resolve, type Mode } from '../src/ds/engine';
import { TONES } from '../src/ds/source/roles';
import ds from '../eslint-rules/ds.mjs';

const WEB = path.resolve(__dirname, '..');
const LEGACY_PATH = path.join(WEB, 'src/ds/legacy-files.json');
const problems: string[] = [];

type Rgba = [number, number, number, number];

function parse(colour: string): Rgba {
  const c = colour.trim();
  const hex = c.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((h) => h + h).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const fn = c.match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (fn) {
    const [r, g, b, a = '1'] = fn.split(/[\s,/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`tokens-check cannot read the colour ${colour}`);
}

const over = (fg: Rgba, bg: Rgba): Rgba => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};

const luminance = ([r, g, b]: Rgba) => {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

function contrast(fg: string, bg: string, page: string): number {
  const ground = over(parse(bg), parse(page));
  const ink = over(parse(fg), ground);
  const [hi, lo] = [luminance(ink), luminance(ground)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function checkContrast(mode: Mode) {
  const { color } = resolve(mode);
  const page = color.surface.canvas;
  const need = (label: string, fg: string, bg: string, min: number) => {
    const ratio = contrast(fg, bg, page);
    if (ratio < min) problems.push(`${mode}: ${label} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  };
  for (const [surface, bg] of Object.entries(color.surface)) {
    if (surface === 'inverse' || surface === 'scrim') continue;
    for (const text of ['base', 'muted', 'faint', 'placeholder', 'link'] as const) need(`text.${text} on surface.${surface}`, color.text[text], bg, 4.5);
  }
  for (const tone of TONES) {
    need(`tone.${tone}.fg on its bg`, color.tone[tone].fg, color.tone[tone].bg, 4.5);
    need(`tone.${tone}.fg on surface.base`, color.tone[tone].fg, color.surface.base, 4.5);
  }
  need('text.onAccent on accent.solid', color.text.onAccent, color.accent.solid, 4.5);
  need('chrome.caption on chrome.bg', color.chrome.caption, color.chrome.bg, 4.5);
}

const CSS_COLOUR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?)\(/i;
const CSS_PX = /(?<![\w-])(?!1px\b)\d*\.?\d+px\b/;

function cssProblems(file: string): string[] {
  const out: string[] = [];
  fs.readFileSync(path.join(WEB, file), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^\s*(\/\*|\*)|@media|@container/.test(line)) return;
      if (CSS_COLOUR.test(line)) out.push(`${file}:${i + 1} has a colour literal; use a --c-* variable`);
      else if (CSS_PX.test(line)) out.push(`${file}:${i + 1} has a px size; use a --s-*, --r-* or --h-* variable`);
    });
  return out;
}

function cssFiles(dir: string): string[] {
  return fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return cssFiles(rel);
    return e.name.endsWith('.css') ? [rel] : [];
  });
}

async function checkLegacy() {
  const legacy: string[] = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
  const sorted = [...legacy].sort();
  if (legacy.some((f, i) => f !== sorted[i])) problems.push('src/ds/legacy-files.json: keep the list sorted');
  const missing = legacy.filter((f) => !fs.existsSync(path.join(WEB, f)));
  missing.forEach((f) => problems.push(`${f} is on src/ds/legacy-files.json but no longer exists; take it off`));

  const scripts = legacy.filter((f) => /\.tsx?$/.test(f) && !missing.includes(f));
  const eslint = new ESLint({
    cwd: WEB,
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: { files: ['src/**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser }, plugins: { ds }, rules: { 'ds/no-raw-style': 'error' } },
  });
  for (const result of await eslint.lintFiles(scripts)) {
    if (!result.messages.some((m) => m.ruleId === 'ds/no-raw-style')) {
      problems.push(`${path.relative(WEB, result.filePath)} is on the tokens now; take it off src/ds/legacy-files.json`);
    }
  }

  for (const file of cssFiles('src')) {
    const found = cssProblems(file);
    const listed = legacy.includes(file);
    if (listed && !found.length && !missing.includes(file)) problems.push(`${file} is on the tokens now; take it off src/ds/legacy-files.json`);
    if (!listed) problems.push(...found);
  }
}

async function main() {
  checkContrast('light');
  checkContrast('dark');
  await checkLegacy();
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  const legacy: string[] = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
  console.log(`tokens-check: contrast holds in both themes; ${legacy.length} files still to move onto tk.`);
}

void main();
