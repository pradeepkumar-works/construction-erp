import type { ContractCurrency } from '../epc';
import { NO_VALUE, formatCount, formatMoneyIn, formatPct, formatQty, inSentence, moneyUnitOf, moneyWords, toNumber, type MoneyUnit, type Words } from '../numbers';
import { BEHIND_TOLERANCE_PCT } from '../schedule';
import { isBadTrend, trendOf } from '../trend';
import type { Figure, FigureInput, FigureWhen, MonthWhen, NoValue } from './figure';
import { measureOf, type Attention, type FigureId, type FigureKind, type MeasureDef } from './measures';

/** Where a figure stands: act and watch need someone (danger, pending tone); calm is plain; quiet is a zero or no value. */
export type FigureState = Attention | 'calm' | 'quiet';

/** One cell, ready to draw: every word chosen, shown and spoken. */
export interface FigureView {
  readonly id: FigureId;
  /** "Work done in Oct" / "Work done in October" */
  readonly label: Words;
  /** "₹ 14.16 Cr" / "₹ 14.16 crore"; a dash when there is no value */
  readonly value: Words;
  /** The exact value for `<data value>` and Excel: rupees to the paisa, the count, the percentage; null with no value */
  readonly machine: string | null;
  /** The count ("4 open bills") and the comparison ("up ₹1.20 Cr on Sep"), joined by " · " */
  readonly note: Words | null;
  readonly state: FigureState;
  /** Whether the note is bad news on its own (a move the wrong way, a flagged part) */
  readonly noteState: Attention | 'calm';
  /** The measure's list with the strip's filters; null when it has none */
  readonly href: string | null;
  /** The measure's definition, for the label's help */
  readonly define: string;
  /** Columns the cell spans at each width, so no row is ragged */
  readonly span: { readonly phone: number; readonly medium: number; readonly wide: number };
}

export interface FiguresView {
  /** The figure that needs action most, drawn larger and first; null when everything is calm */
  readonly lead: FigureView | null;
  /** The others, in the caller's order */
  readonly rest: readonly FigureView[];
  /** Flag figures at zero, in one quiet line: "Nothing overdue, no MSME bill at risk" */
  readonly clear: Words | null;
  readonly columns: { readonly phone: 2; readonly medium: number; readonly wide: number };
  /** The money unit the strip's values share */
  readonly unit: MoneyUnit | null;
}

/** The filters a strip's links carry (the header's project, a vendor chosen on the page). */
export type FigureScope = Readonly<Partial<Record<'projectId' | 'vendorId' | 'vertical', string>>>;

export interface PresentOptions {
  /** YYYY-MM-DD in India, for "so far" and the year of a month */
  readonly today: string;
  readonly scope?: FigureScope;
  /** A project's contract currency: money reads in it */
  readonly currency?: ContractCurrency | null;
}

/** At most this many cells in a strip; more is a design error, thrown outside production. */
export const MAX_FIGURES = 6;

declare const process: { env: { NODE_ENV?: string } };
const production = () => typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LEVEL = { calm: 0, watch: 1, act: 2 } as const;
const KIND_RANK: Record<FigureKind, number> = { money: 3, days: 2, count: 1, pct: 0, qty: 0 };

const words = (text: string, spoken = text): Words => ({ text, spoken });
const say = (...parts: (Words | string)[]): Words => ({
  text: parts.map((p) => (typeof p === 'string' ? p : p.text)).join(''),
  spoken: parts.map((p) => (typeof p === 'string' ? p : p.spoken)).join(''),
});
const isNone = (v: unknown): v is NoValue => typeof v === 'object' && v !== null && 'none' in v;
const amountOf = (f: Figure): number | null => (isNone(f.value) ? null : toNumber(f.value));
const strongest = (...ls: (Attention | 'calm')[]): Attention | 'calm' => ls.reduce((a, b) => (LEVEL[b] > LEVEL[a] ? b : a), 'calm');
const lowerFirst = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

function monthWords(ym: string, today: string): Words {
  const [y, m] = ym.split('-');
  const long = MONTHS[Number(m) - 1] ?? ym;
  const year = y !== today.slice(0, 4) ? ` ${y}` : '';
  return words(`${long.slice(0, 3)}${year}`, `${long}${year}`);
}

function whenWords(when: FigureWhen, today: string): Words {
  if (when === 'today') return words('today');
  if (when === 'toDate') return words('to date');
  return say('in ', monthWords(when.month, today));
}

/** "Sep" or "the same days of Sep": the period a comparison is with. */
const periodWords = (when: MonthWhen, today: string): Words => (when.sameDays ? say('the same days of ', monthWords(when.month, today)) : monthWords(when.month, today));

function valueWords(kind: FigureKind, n: number, unit: MoneyUnit | null, c?: ContractCurrency | null): Words {
  switch (kind) {
    case 'money':
      return formatMoneyIn(n, unit ?? moneyUnitOf([n], c), c);
    case 'pct': {
      const t = formatPct(n);
      return words(t, t.replace('%', ' percent'));
    }
    case 'days':
      return words(`${formatQty(n)} ${n === 1 ? 'day' : 'days'}`);
    case 'qty':
      return words(formatQty(n));
    case 'count':
      return words(formatCount(n));
  }
}

/** An amount inside a note keeps its own unit: "₹3.20 L due in 7 days" beside a strip in crore. */
const noteAmount = (kind: FigureKind, n: number, c?: ContractCurrency | null) => (kind === 'money' ? moneyWords(n, c) : valueWords(kind, n, null, c));

function changeWords(kind: FigureKind, d: number, c?: ContractCurrency | null): Words {
  const abs = Math.abs(d);
  if (kind === 'pct') {
    const points = Math.round(abs * 10) / 10;
    return words(`${formatQty(points)} ${points === 1 ? 'point' : 'points'}`);
  }
  return noteAmount(kind, abs, c);
}

/** A thing counted with the measure's own names: "14 projects", "1 open bill". */
const counted = (n: number, items: readonly [string, string]) => words(`${formatCount(n)} ${n === 1 ? items[0] : items[1]}`);

/** Another figure inside a note: "₹2.10 Cr over 90 days", "14 projects", "₹171.10 Cr contract value". */
function partWords(f: Figure, c?: ContractCurrency | null): Words | null {
  const m = measureOf(f.id);
  const n = amountOf(f);
  if (n === null) return null;
  if (m.kind === 'count' && !m.asPart && m.items) return counted(n, m.items);
  return say(noteAmount(m.kind, n, c), ' ', m.asPart ?? inSentence(m.label));
}

/** The measure's own verdict on its value: a flag above zero, a value outside its limit. */
function ownLevel(m: MeasureDef, n: number): Attention | 'calm' {
  if (m.flag) return n > 0 ? m.flag.level : 'calm';
  if (m.limit && ((m.limit.below !== undefined && n < m.limit.below) || (m.limit.above !== undefined && n > m.limit.above))) return m.limit.level;
  return 'calm';
}

const wrongWay = (m: MeasureDef, d: number) => m.better !== 'either' && d !== 0 && d > 0 !== (m.better === 'up');

/** The comparison in words, and whether it is bad news on its own. */
function versusOf(f: Figure, m: MeasureDef, opts: PresentOptions): { words: Words | null; level: Attention | 'calm' } {
  const v = f.versus;
  const c = opts.currency;
  const now = amountOf(f) ?? 0;
  const calm = (w: Words | null) => ({ words: w, level: 'calm' as const });
  if (!v) return calm(null);
  if ('was' in v) {
    const was = toNumber(v.was);
    const period = periodWords(v.when, opts.today);
    if (now === 0) return calm(was ? say(noteAmount(m.kind, was, c), ' in ', period) : null);
    if (was === 0) return calm(say('nothing in ', period));
    const d = now - was;
    if (d === 0) return calm(say('same as ', period));
    const bad = wrongWay(m, d) && Math.abs(d) >= Math.abs(was) * 0.1;
    return { words: say(d > 0 ? 'up ' : 'down ', changeWords(m.kind, d, c), ' on ', period), level: bad ? 'watch' : 'calm' };
  }
  if ('plan' in v) {
    const plan = toNumber(v.plan);
    const d = Math.round((now - plan) * 10) / 10;
    const behind = m.better === 'down' ? d > 0 : d < 0;
    const gap = d === 0 ? words('on plan') : say(changeWords(m.kind, d, c), behind ? ' behind' : ' ahead');
    const far = behind && (m.kind === 'pct' ? Math.abs(d) > BEHIND_TOLERANCE_PCT : Math.abs(d) > (Math.abs(plan) * BEHIND_TOLERANCE_PCT) / 100);
    return { words: say(noteAmount(m.kind, plan, c), ' planned by now, ', gap), level: far ? 'watch' : 'calm' };
  }
  if ('of' in v) {
    if (typeof v.of === 'object') {
      const p = partWords(v.of, c);
      return calm(p && say('of ', p));
    }
    const whole = toNumber(v.of);
    return calm(say('of ', m.kind === 'count' && m.items ? counted(whole, m.items) : noteAmount(m.kind, whole, c)));
  }
  if ('part' in v) {
    const pm = measureOf(v.part.id);
    const n = amountOf(v.part);
    if (n === null) return calm(null);
    if (n === 0) return calm(pm.flag ? words(pm.flag.clear) : null);
    return { words: partWords(v.part, c), level: ownLevel(pm, n) };
  }
  const t = trendOf(v.trend, v.months, m.better !== 'down', opts.today);
  const prevMonth = v.months[v.months.length - 2];
  if (!prevMonth) return calm(null);
  const prev = monthWords(prevMonth, opts.today);
  const before = t.values[t.values.length - 2] ?? 0;
  if (now === 0) return calm(before ? say(noteAmount(m.kind, before, c), ' in ', prev) : null);
  const delta = t.deltaPct;
  if (delta === null) return calm(null);
  const level = m.better !== 'either' && isBadTrend(t) ? 'watch' : 'calm';
  if (delta === 0) return { words: say('same as ', prev), level };
  if (delta >= 200 && t.ratio) return { words: words(`${Math.round(t.ratio)}× ${prev.text}`, `${Math.round(t.ratio)} times ${prev.spoken}`), level };
  const soFar = t.elapsed < 1 && delta < 0 ? ' so far' : '';
  const pct = formatPct(Math.abs(delta));
  return { words: words(`${delta > 0 ? 'up' : 'down'} ${pct} on ${prev.text}${soFar}`, `${delta > 0 ? 'up' : 'down'} ${pct.replace('%', ' percent')} on ${prev.spoken}${soFar}`), level };
}

function withScope(list: string, scope?: FigureScope): string {
  const params = Object.entries(scope ?? {}).filter(([, v]) => !!v);
  if (!params.length) return list;
  return `${list}${list.includes('?') ? '&' : '?'}${params.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')}`;
}

/**
 * Spans for cells wanting `want` columns each, `columns` to a row: a cell that does not fit starts the next row, and a
 * row's free columns go to its cells from the last back, so every row is full.
 */
function gridSpans(want: readonly number[], columns: number): number[] {
  const spans: number[] = [];
  let row: number[] = [];
  let used = 0;
  const close = () => {
    for (let free = columns - used, k = row.length - 1; free > 0; free--, k = k === 0 ? row.length - 1 : k - 1) spans[row[k]]++;
    row = [];
    used = 0;
  };
  want.forEach((w, i) => {
    const span = Math.min(w, columns);
    if (used + span > columns) close();
    spans[i] = span;
    row.push(i);
    used += span;
    if (used === columns) {
      row = [];
      used = 0;
    }
  });
  if (row.length) close();
  return spans;
}

interface Draft {
  readonly view: Omit<FigureView, 'span'>;
  readonly kind: FigureKind;
  readonly size: number;
  readonly order: number;
}

/**
 * Facts to a strip, in one pass: one money unit for the values (notes keep their own), every word shown and spoken,
 * each figure's state (the strongest of its measure's flag or limit, its part, a move the wrong way and the caller's
 * verdict; a zero or no value is quiet), flag figures at zero folded into one line, the lead (the strongest act or watch
 * figure: money before days before counts, then the larger amount, then the caller's order; none when all is calm) and
 * the spans at each width.
 */
export function presentFigures(input: readonly FigureInput[], opts: PresentOptions): FiguresView {
  const facts = input.filter((f): f is Figure => !!f);
  if (facts.length > MAX_FIGURES && !production()) throw new Error(`A strip shows at most ${MAX_FIGURES} figures; it was given ${facts.length}`);
  const c = opts.currency;

  const clear: string[] = [];
  const shown = facts.filter((f) => {
    const m = measureOf(f.id);
    if (m.flag && amountOf(f) === 0) {
      clear.push(m.flag.clear);
      return false;
    }
    return true;
  });

  const shownAmount = (f: Figure) => {
    const n = amountOf(f);
    return n !== null && n < 0 && measureOf(f.id).negativeLabel ? -n : n;
  };
  const money = shown.filter((f) => measureOf(f.id).kind === 'money').map(shownAmount).filter((n): n is number => n !== null);
  const unit = money.length ? moneyUnitOf(money, c) : null;

  const drafts: Draft[] = shown.map((f, order) => {
    const m = measureOf(f.id);
    const n = amountOf(f);
    const shownN = shownAmount(f);
    const name = n !== null && n < 0 && m.negativeLabel ? m.negativeLabel : m.label;
    const label = f.when ? say(name, ' ', whenWords(f.when, opts.today)) : words(name);
    const versus = versusOf(f, m, opts);
    const verdict = typeof f.attention === 'object' ? f.attention : null;
    const count = f.count !== undefined && m.items ? counted(f.count, m.items) : null;
    const reason = versus.words ?? (verdict ? words(verdict.because) : isNone(f.value) ? words(f.value.none) : null);
    const note = count && reason ? say(count, ' · ', words(lowerFirst(reason.text), lowerFirst(reason.spoken))) : (count ?? reason);
    const noteState = strongest(versus.level, verdict?.level ?? 'calm');
    const state: FigureState = n === null || n === 0 ? 'quiet' : strongest(ownLevel(m, n), noteState, typeof f.attention === 'string' ? f.attention : 'calm');
    const view = {
      id: f.id,
      label,
      value: shownN === null ? words(NO_VALUE, 'no figure') : valueWords(m.kind, shownN, unit, c),
      machine: shownN === null ? null : m.kind === 'money' ? shownN.toFixed(2) : String(shownN),
      note,
      state,
      noteState,
      href: m.list ? withScope(m.list, opts.scope) : null,
      define: m.define,
    };
    return { view, kind: m.kind, size: Math.abs(shownN ?? 0), order };
  });

  const level = (d: Draft) => (d.view.state === 'act' || d.view.state === 'watch' ? LEVEL[d.view.state] : 0);
  const lead = drafts.filter((d) => level(d) > 0).sort((a, b) => level(b) - level(a) || KIND_RANK[b.kind] - KIND_RANK[a.kind] || b.size - a.size || a.order - b.order)[0] ?? null;
  const ordered = lead ? [lead, ...drafts.filter((d) => d !== lead)] : drafts;

  const slots = ordered.length + (lead ? 1 : 0);
  const columns = { phone: 2 as const, medium: Math.max(1, Math.min(4, slots)), wide: Math.max(1, slots) };
  const want = ordered.map((d) => (d === lead ? 2 : 1));
  const phone = gridSpans(want, columns.phone);
  const medium = gridSpans(want, columns.medium);
  const wide = gridSpans(want, columns.wide);
  const views: FigureView[] = ordered.map((d, i) => ({ ...d.view, span: { phone: phone[i], medium: medium[i], wide: wide[i] } }));

  return {
    lead: lead ? views[0] : null,
    rest: lead ? views.slice(1) : views,
    clear: clear.length ? words(clear.map((s, i) => (i === 0 ? s : lowerFirst(s))).join(', ')) : null,
    columns,
    unit,
  };
}
