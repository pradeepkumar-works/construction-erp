/**
 * Checks the design tokens (docs/design/REDESIGN.md). CI runs it:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json scripts/tokens-check.ts
 * - every text role reads at 4.5:1 on every surface it sits on, in both themes, and each tone's text on its own fill;
 * - a CSS file holds no colour literal and no px size outside 1px lines and media queries (TS and TSX files are
 *   held to the tokens by ESLint's `ds/no-raw-style`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolve, type Mode } from '../src/ds/engine';
import { TONES } from '../src/ds/source/roles';
import { CHROME_PALETTES, CHROME_START_FILL } from '../src/ds/source/chrome';
import { MENU_CONTRAST, inkFor, weakestContrast } from '@erp/shared';

const WEB = path.resolve(__dirname, '..');
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
  need('text.onAccent on state.countFill', color.text.onAccent, color.state.countFill, 4.5);
  // The AI mark is an icon and an edge, so 3:1; text on the AI wash is the page's own text, held above.
  need('ai.mark on surface.base', color.ai.mark, color.surface.base, 3);
  need('ai.mark on ai.soft', color.ai.mark, color.ai.soft, 3);
  need('text.muted on ai.soft', color.text.muted, color.ai.soft, 4.5);
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

/** Every CSS file reads the tokens' variables: no colour literal, no px size outside 1px lines and media queries. */
function checkCss() {
  for (const file of cssFiles('src')) problems.push(...cssProblems(file));
}

/** Each of the menu's palettes keeps its captions at 4.5:1 over all of its fill, in both themes (Menu and names). */
function checkPalettes() {
  const fills = [...Object.entries(CHROME_PALETTES).flatMap(([key, p]) => [[`${key} light`, p.light], [`${key} dark`, p.dark]] as const), ...Object.entries(CHROME_START_FILL).map(([k, f]) => [`own ${k}`, f] as const)];
  for (const [label, fill] of fills) {
    const ink = inkFor(fill);
    if (!ink) problems.push(`menu palette ${label}: no ink keeps the captions at ${MENU_CONTRAST}:1 (best ${Math.max(weakestContrast(fill, 'light'), weakestContrast(fill, 'dark')).toFixed(2)}:1)`);
  }
}

function main() {
  checkContrast('light');
  checkContrast('dark');
  checkPalettes();
  checkCss();
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('tokens-check: contrast holds in both themes, and every CSS file reads the tokens.');
}

main();
