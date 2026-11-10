/**
 * Checks the words both apps take from `@erp/shared` against docs/WRITING.md. CI runs it:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json scripts/copy-check.ts
 * - every value of an exported `*_LABELS` map, and every name in the menu (the navigation tree's labels, the department
 *   modules and their sub-modules), is sentence case: a capital after the first word only in an abbreviation (a word in
 *   capitals: GST, DPRs) or a name WRITING.md lists under Capitals;
 * - none of them, nor a tile's or module's description, has "&" or "...";
 * - no menu name, Search kind or label uses a name the "Words we use" table retires, nor one `RETIRED_FOR` retires
 *   (in the maps it names, where the word is right elsewhere);
 * - screen text ("Screen text"): no page title has a sentence under it (a text `subtitle` goes in `help`), and the
 *   explanations left on screen (`LONG_WORDS` or more, outside an ⓘ) are no more than `LONG_ON_SCREEN`, which only falls.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as shared from '@erp/shared';
import { DEPARTMENT_MODULES, NAV_TREE } from '@erp/shared';
import { LONG_WORDS, screenStrings } from './copy/screen-text';

/** Lower it when a change takes explanations off the screen; never raise it. */
const LONG_ON_SCREEN = 53;

const WRITING_PATH = path.resolve(__dirname, '../../../docs/WRITING.md');
const writing = fs.readFileSync(WRITING_PATH, 'utf8');
const problems: string[] = [];

const namesLine = writing.match(/^- \*\*Capitals\*\*[\s\S]*?these names: ([\s\S]+?)\.\s*$/m);
if (!namesLine) throw new Error(`${WRITING_PATH}: no "- **Capitals** … these names: …." bullet`);
const NAMES = namesLine[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

const table = writing.split(/^## Words we use$/m)[1]?.split(/^## /m)[0];
if (!table) throw new Error(`${WRITING_PATH}: no "## Words we use" section`);
const RETIRED = table
  .split('\n')
  .filter((l) => /^\|/.test(l) && !/^\|\s*(Thing|-)/.test(l))
  .flatMap((l) => {
    const [thing, name, not] = l.split('|').slice(1, 4).map((c) => c.trim());
    return (not ?? '').split(',').map((r) => r.trim().replace(/^"|"$/g, '')).filter((r) => r && r !== '–').map((r): Retired => ({ r, thing, name }));
  });

interface Retired {
  r: string;
  thing: string;
  name: string;
  /** Retired only in these label maps */
  maps?: string[];
}
/** Names retired only in some label maps; the names retired everywhere are in the table. */
const RETIRED_FOR: Retired[] = [
  { r: 'Live', thing: 'A permit in force', name: 'Issued', maps: ['WORK_PERMIT_STATUS_LABELS'] },
  { r: 'Received', thing: 'An inward letter', name: 'Inward', maps: ['LETTER_DIRECTION_LABELS'] },
  { r: 'Sent', thing: 'An outward letter', name: 'Outward', maps: ['LETTER_DIRECTION_LABELS'] },
  { r: 'Waiting for approval', thing: 'A letter waiting for its signatory', name: 'Waiting for signature', maps: ['LETTER_STATUS_LABELS'] },
  // One figure, one name (ARCHITECTURE "Headline figures"): right as page names, never as a figure's.
  { r: 'Outstanding', thing: 'What clients or vendors are owed', name: 'Clients owe; We owe', maps: ['FIGURE_LABELS'] },
  { r: 'Receivables', thing: 'What clients owe', name: 'Clients owe', maps: ['FIGURE_LABELS'] },
  { r: 'Vendor payable', thing: 'What the company owes vendors', name: 'We owe', maps: ['FIGURE_LABELS'] },
  { r: 'Clients owe us', thing: 'What clients owe', name: 'Clients owe', maps: ['FIGURE_LABELS'] },
  { r: 'Retention held', thing: 'Retention deducted by clients, not yet released', name: 'Retention with clients', maps: ['FIGURE_LABELS'] },
  { r: 'Overdue to suppliers', thing: 'What we owe past its due date', name: 'Overdue to vendors', maps: ['FIGURE_LABELS'] },
];
RETIRED.push(...RETIRED_FOR);

/** Tally's own group names, which the export and the books have to match word for word. */
const OUTSIDE_WORDS = new Set(['ACCOUNT_GROUP_LABELS']);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (s: string) => new RegExp(`(?<![\\w])${escape(s)}(?![\\w])`, 'i');

function sentenceCase(text: string): string | null {
  let rest = text;
  for (const n of NAMES) rest = rest.replace(new RegExp(`(?<![\\w])${escape(n)}(?![\\w])`, 'g'), ' ');
  const words = rest.split(/[\s(),/·:;"“”‘’?!-]+/).filter(Boolean);
  const bad = words.slice(text.startsWith(words[0] ?? '') ? 1 : 0).filter((w) => {
    const bare = w.replace(/['’]s$/, '');
    return /[A-Z]/.test(bare) && !/^[A-Z0-9&.]{2,}s?$/.test(bare) && !/\d/.test(bare);
  });
  return bad.length ? `capitals in ${bad.map((w) => `"${w}"`).join(', ')}` : null;
}

function punctuation(text: string): string | null {
  let rest = text;
  for (const n of NAMES) rest = rest.split(n).join(' ');
  rest = rest.replace(/[A-Z]+&[A-Z]+/g, ' ');
  if (rest.includes('&')) return 'has "&" (write "and")';
  if (rest.includes('...')) return 'has "..." (write "…")';
  return null;
}

const retiredIn = (map?: string) => (text: string): string | null => {
  const hit = RETIRED.find(({ r, maps }) => (!maps || (map !== undefined && maps.includes(map))) && phrase(r).test(text));
  return hit ? `uses "${hit.r}", retired for ${hit.thing.toLowerCase()} (write "${hit.name.split(/[;(]/)[0].trim()}")` : null;
};

const check = (where: string, text: string, rules: ((t: string) => string | null)[]) => {
  for (const rule of rules) {
    const p = rule(text);
    if (p) problems.push(`${where}: "${text}" ${p}`);
  }
};

const labelMaps = Object.entries(shared).filter(([k, v]) => k.endsWith('_LABELS') && v && typeof v === 'object');
for (const [map, values] of labelMaps) {
  if (OUTSIDE_WORDS.has(map)) continue;
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    const text = typeof value === 'string' ? value : typeof (value as { label?: unknown })?.label === 'string' ? (value as { label: string }).label : null;
    if (text !== null) check(`${map}.${key}`, text, [sentenceCase, punctuation, retiredIn(map)]);
  }
}

for (const n of NAV_TREE) {
  check(`NAV_TREE ${n.id} label`, n.label, [sentenceCase, punctuation, retiredIn()]);
  if (typeof n.nav === 'string') check(`NAV_TREE ${n.id} nav`, n.nav, [sentenceCase, punctuation, retiredIn()]);
  check(`NAV_TREE ${n.id} description`, n.description, [punctuation]);
}
for (const m of DEPARTMENT_MODULES) {
  check(`DEPARTMENT_MODULES ${m.key} label`, m.label, [sentenceCase, punctuation, retiredIn()]);
  check(`DEPARTMENT_MODULES ${m.key} description`, m.description, [punctuation]);
  for (const s of m.subs) check(`DEPARTMENT_MODULES ${m.key}.${s.key} label`, s.label, [sentenceCase, punctuation, retiredIn()]);
}

const screen = screenStrings();
for (const at of screen.subtitleSentences) problems.push(`${at}: a sentence under the page title; pass it as PageHeader's help`);
const long = screen.strings.filter((s) => s.words >= LONG_WORDS);
if (long.length > LONG_ON_SCREEN) {
  problems.push(
    `${long.length} explanations of ${LONG_WORDS} words or more on screen, over the ${LONG_ON_SCREEN} allowed; put the new one behind an ⓘ (help, tooltip) or cut it (scripts/copy/screen-text.ts lists them)`,
  );
}

if (problems.length) {
  console.error(`copy-check: ${problems.length} problem(s) against docs/WRITING.md\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`copy-check: ${labelMaps.length} label maps, ${NAV_TREE.length} tree nodes and ${DEPARTMENT_MODULES.length} department modules read as WRITING.md asks; ${long.length} long explanations on screen (${LONG_ON_SCREEN} allowed)`);
