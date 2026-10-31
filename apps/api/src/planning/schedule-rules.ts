import type { ActivityLinkType, LookaheadReadiness } from '@erp/shared';

/**
 * Links between activities and the critical path, on calendar days: an activity runs from its start day
 * to its end day, both counted, so a one-day activity starts and ends on the same day. Pure functions, tested in
 * `src/scripts/schedule-links-test.ts`.
 */
const DAY_MS = 86_400_000;
export const dayNo = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY_MS);
export const fromDayNo = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromDayNo(dayNo(d) + n);

export interface NetActivity {
  id: string;
  start: string | null;
  end: string | null;
  /** Done activities keep their dates and float nothing */
  done?: boolean;
  /** Started: it began on this day whatever the links say, and runs its planned length from it */
  startedOn?: string | null;
}
export interface NetLink {
  pred: string;
  succ: string;
  type: ActivityLinkType;
  lag: number;
}
export interface NetResult {
  es: string;
  ef: string;
  ls: string;
  lf: string;
  float: number;
  critical: boolean;
}

/** An activity whose links go round in a circle back to it, or null. Only the links given count. */
export function findCycle(ids: string[], links: NetLink[]): string[] | null {
  const next = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const l of links) next.get(l.pred)?.push(l.succ);
  const state = new Map<string, 1 | 2>();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    path.push(id);
    for (const n of next.get(id) ?? []) {
      if (state.get(n) === 1) return path.slice(path.indexOf(n));
      if (!state.get(n)) {
        const found = visit(n);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, 2);
    return null;
  };
  for (const id of ids) if (!state.get(id)) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

/** Why a new link cannot be made, or null: an activity to itself, the same pair twice, or a circle. */
export function linkProblem(ids: string[], links: NetLink[], link: NetLink, names: (id: string) => string = (i) => i): string | null {
  if (link.pred === link.succ) return 'An activity cannot follow itself.';
  if (!ids.includes(link.pred) || !ids.includes(link.succ)) return 'Both activities must be on this project.';
  if (links.some((l) => l.pred === link.pred && l.succ === link.succ)) return `${names(link.succ)} already follows ${names(link.pred)}. Change that link instead.`;
  if (Math.abs(link.lag) > 365) return 'A lag is at most 365 days either way.';
  const cycle = findCycle(ids, [...links, link]);
  if (cycle) return `That makes a loop: ${[...cycle, cycle[0]].map(names).join(' → ')}.`;
  return null;
}

/** The earliest day a successor of `duration` days may start for one link, given its predecessor's early start and finish. */
function startAllowed(type: ActivityLinkType, lag: number, predStart: number, predEnd: number, duration: number): number {
  switch (type) {
    case 'FS':
      return predEnd + 1 + lag;
    case 'SS':
      return predStart + lag;
    case 'FF':
      return predEnd + lag - duration + 1;
    case 'SF':
      return predStart + lag - duration + 1;
  }
}

/** The latest day a predecessor of `duration` days may finish for one link, given its successor's late start and finish. */
function finishAllowed(type: ActivityLinkType, lag: number, succStart: number, succEnd: number, duration: number): number {
  switch (type) {
    case 'FS':
      return succStart - 1 - lag;
    case 'SS':
      return succStart - lag + duration - 1;
    case 'FF':
      return succEnd - lag;
    case 'SF':
      return succEnd - lag + duration - 1;
  }
}

/**
 * The critical path method over the activities with dates. Each keeps its planned duration and starts no earlier than
 * its planned start (the plan is a constraint, not a suggestion), later when a link says so; one already started runs
 * its planned length from the day it started, and done ones stay where they ran. The backward pass runs from the latest early finish. Links touching an activity without dates are ignored.
 * Returns null when the links make a loop.
 */
export function criticalPath(activities: NetActivity[], links: NetLink[]): { results: Map<string, NetResult>; finish: string | null } | null {
  const dated = activities.filter((a) => a.start && a.end && a.end >= a.start);
  const byId = new Map(dated.map((a) => [a.id, a]));
  const used = links.filter((l) => byId.has(l.pred) && byId.has(l.succ));
  if (findCycle([...byId.keys()], used)) return null;
  const dur = (a: NetActivity) => dayNo(a.end!) - dayNo(a.start!) + 1;

  // Topological order (Kahn).
  const incoming = new Map<string, NetLink[]>(dated.map((a) => [a.id, []]));
  const outgoing = new Map<string, NetLink[]>(dated.map((a) => [a.id, []]));
  for (const l of used) {
    incoming.get(l.succ)!.push(l);
    outgoing.get(l.pred)!.push(l);
  }
  const waiting = new Map(dated.map((a) => [a.id, incoming.get(a.id)!.length]));
  const order: string[] = [];
  const queue = dated.filter((a) => !waiting.get(a.id)).map((a) => a.id);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const l of outgoing.get(id)!) {
      const left = waiting.get(l.succ)! - 1;
      waiting.set(l.succ, left);
      if (!left) queue.push(l.succ);
    }
  }

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const a = byId.get(id)!;
    const d = dur(a);
    let start = dayNo(a.startedOn ?? a.start!);
    if (!a.done && !a.startedOn)
      for (const l of incoming.get(id)!) start = Math.max(start, startAllowed(l.type, l.lag, es.get(l.pred)!, ef.get(l.pred)!, d));
    es.set(id, start);
    ef.set(id, start + d - 1);
  }
  if (!order.length) return { results: new Map(), finish: null };
  const finish = Math.max(...ef.values());

  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const a = byId.get(id)!;
    const d = dur(a);
    let end = finish;
    for (const l of outgoing.get(id)!) {
      // A successor already started (or done) no longer waits on this one's start or finish; only finish links still bind.
      const succ = byId.get(l.succ)!;
      if ((succ.startedOn || succ.done) && (l.type === 'FS' || l.type === 'SS')) continue;
      end = Math.min(end, finishAllowed(l.type, l.lag, ls.get(l.succ)!, lf.get(l.succ)!, d));
    }
    // Done work does not float: it sits where it ran.
    if (a.done) end = ef.get(id)!;
    lf.set(id, end);
    ls.set(id, end - d + 1);
  }

  const results = new Map<string, NetResult>();
  for (const id of order) {
    const float = lf.get(id)! - ef.get(id)!;
    results.set(id, { es: fromDayNo(es.get(id)!), ef: fromDayNo(ef.get(id)!), ls: fromDayNo(ls.get(id)!), lf: fromDayNo(lf.get(id)!), float, critical: !byId.get(id)!.done && float <= 0 });
  }
  return { results, finish: fromDayNo(finish) };
}

/** The activities the links push later than planned, with the dates they would move to (duration kept). */
export function moves(activities: NetActivity[], result: Map<string, NetResult>): { id: string; start: string; end: string }[] {
  return activities.flatMap((a) => {
    const r = result.get(a.id);
    if (!r || a.done || a.startedOn || !a.start || r.es === a.start.slice(0, 10)) return [];
    return [{ id: a.id, start: r.es, end: r.ef }];
  });
}

/**
 * Whether an activity can start: under way once it has progress; otherwise ready when every finish link's predecessor is
 * done, every start link's predecessor has started and the links' lags let it start by today (`earliest`); else waiting
 * on those that are not.
 */
export function readiness(
  a: { progressPct: number; earliest?: string | null },
  preds: { name: string; type: ActivityLinkType; progressPct: number }[],
  today?: string,
): { readiness: LookaheadReadiness; waitingOn: string[] } {
  if (a.progressPct > 0) return { readiness: 'IN_PROGRESS', waitingOn: [] };
  const waitingOn = preds.filter((p) => (p.type === 'FS' || p.type === 'FF' ? p.progressPct < 100 : p.progressPct <= 0)).map((p) => p.name);
  if (!waitingOn.length && a.earliest && today && a.earliest > today) return { readiness: 'WAITING', waitingOn: preds.map((p) => p.name) };
  return { readiness: waitingOn.length ? 'WAITING' : 'READY', waitingOn };
}

/** The Monday of the week holding `day`, and the three weeks from it. */
export function lookaheadWeeks(today: string): { from: string; to: string }[] {
  const n = dayNo(today);
  const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
  const monday = n - weekday;
  return [0, 1, 2].map((w) => ({ from: fromDayNo(monday + 7 * w), to: fromDayNo(monday + 7 * w + 6) }));
}
