/**
 * Pipe network (item 126): a pipe zone's or main's hydraulic model, junctions and the pipes between them, and how far
 * each stage of work has got on each pipe. Reading a model file (EPANET .inp, or an Excel book of nodes and pipes),
 * the import's preview, the figures per segment and per diameter, and the working fronts are pure functions here; the
 * API and the screens share them. ARCHITECTURE "Pipe network".
 */
import { PIPE_MATERIALS, PIPE_NODE_KINDS, PIPE_STAGES, type PipeMaterial, type PipeNodeKind, type PipeScope, type PipeStage, type WorkElementType } from './enums';
import { PIPE_STAGE_LABELS } from './labels';

/** The kinds of component that carry a pipe network. */
export const PIPE_ELEMENT_TYPES: WorkElementType[] = ['PIPE_ZONE', 'RISING_MAIN', 'FEEDER_MAIN'];
export const isPipeElement = (type: WorkElementType | null | undefined) => !!type && PIPE_ELEMENT_TYPES.includes(type);

/** The stages measured in metres along a segment, in order; valves are counted on nodes instead. */
export const SEGMENT_STAGES = PIPE_STAGES.filter((s) => s !== 'VALVES') as Exclude<PipeStage, 'VALVES'>[];
export type SegmentStage = (typeof SEGMENT_STAGES)[number];

/** A stage's share of a segment's own %: laying is most of the work, commissioning the least. */
export const PIPE_STAGE_WEIGHTS: Record<SegmentStage, number> = { TRENCH: 15, BEDDING: 5, LAY_JOINT: 40, BACKFILL: 10, TEST: 15, RESTORATION: 10, COMMISSIONING: 5 };

/** Node kinds that are fittings on the line, fixed as the VALVES stage. */
export const VALVE_NODE_KINDS: PipeNodeKind[] = ['SLUICE_VALVE', 'AIR_VALVE', 'SCOUR', 'CHAMBER'];
/** Node kinds water comes from: a front can start at one. */
export const SOURCE_NODE_KINDS: PipeNodeKind[] = ['TANK', 'SOURCE'];

/**
 * The stage an activity of a pipe zone or main stands for, read from its name when it was not set ("Trench excavation",
 * "Pipe lowering, laying and jointing", "Road restoration over the trench"); null for anything else on the zone.
 */
export function guessPipeStage(name: string): PipeStage | null {
  const n = name.toLowerCase();
  if (/restor|reinstat/.test(n)) return 'RESTORATION';
  if (/commission|flush|disinfect|chlorinat/.test(n)) return 'COMMISSIONING';
  if (/test/.test(n)) return 'TEST';
  if (/backfill|refill/.test(n)) return 'BACKFILL';
  if (/valve|special|chamber/.test(n)) return 'VALVES';
  if (/bedding|cushion/.test(n)) return 'BEDDING';
  if (/lay|lower|joint/.test(n)) return 'LAY_JOINT';
  if (/trench|excavat/.test(n)) return 'TRENCH';
  return null;
}

/** The stage an activity stands for: its own, else read from its name when it sits on a pipe zone or main. */
export const activityPipeStage = (a: { pipeStage?: PipeStage | null; name: string; elementType?: WorkElementType | null }): PipeStage | null =>
  a.pipeStage ?? (isPipeElement(a.elementType) ? guessPipeStage(a.name) : null);

/** Codes in model order: P-2 before P-10. */
export const comparePipeCodes = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** How a segment is named on a line or a list: "P-27, J-12 to J-13". */
export const segmentLabel = (s: { code: string; fromCode: string; toCode: string }) => `${s.code}, ${s.fromCode} to ${s.toCode}`;

/* ---------- reading a model ---------- */

export interface PipeNodeInput {
  code: string;
  kind: PipeNodeKind;
  groundLevel: number | null;
  x: number | null;
  y: number | null;
  chainage: number | null;
}

export interface PipeSegmentInput {
  code: string;
  from: string;
  to: string;
  lengthM: number;
  diameterMm: number;
  material: PipeMaterial;
  pipeClass: string | null;
  scope: PipeScope;
  surface: string | null;
  crossing: string | null;
}

/** A network read from a file: its nodes and pipes, and what was left out or changed on the way in. */
export interface PipeNetworkFile {
  nodes: PipeNodeInput[];
  pipes: PipeSegmentInput[];
  notes: string[];
}

/** Most nodes or pipes one import takes. */
export const MAX_NETWORK_SIZE = 5000;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
};

/** US flow units in an EPANET file mean lengths in feet and diameters in inches. */
const US_FLOW_UNITS = new Set(['CFS', 'GPM', 'MGD', 'IMGD', 'AFD']);

/**
 * An EPANET .inp file, the format WaterGEMS, LOOP and EPANET all write: junctions, reservoirs and tanks become nodes,
 * pipes become segments, coordinates place the nodes, and a valve link becomes a valve node between its two ends. Pumps
 * are left out and said so. Lengths and diameters come out in metres and millimetres whatever units the file uses.
 */
export function parseEpanetInp(text: string): PipeNetworkFile {
  const nodes = new Map<string, PipeNodeInput>();
  const pipes: PipeSegmentInput[] = [];
  const notes: string[] = [];
  const valves: { code: string; a: string; b: string }[] = [];
  const coords = new Map<string, [number, number]>();
  let section = '';
  let us = false;
  let pumps = 0;
  const node = (code: string, kind: PipeNodeKind, groundLevel: number | null) => {
    if (!nodes.has(code)) nodes.set(code, { code, kind, groundLevel, x: null, y: null, chainage: null });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    const head = /^\[([A-Z_]+)\]$/i.exec(line);
    if (head) {
      section = head[1].toUpperCase();
      continue;
    }
    const f = line.split(/\s+/);
    switch (section) {
      case 'OPTIONS':
        if (/^units$/i.test(f[0]) && f[1]) us = US_FLOW_UNITS.has(f[1].toUpperCase());
        break;
      case 'JUNCTIONS':
        node(f[0], 'JUNCTION', finite(f[1]));
        break;
      case 'RESERVOIRS':
        node(f[0], 'SOURCE', finite(f[1]));
        break;
      case 'TANKS':
        node(f[0], 'TANK', finite(f[1]));
        break;
      case 'PIPES': {
        const lengthM = finite(f[3]);
        const diameterMm = finite(f[4]);
        pipes.push({ code: f[0], from: f[1], to: f[2], lengthM: lengthM ?? 0, diameterMm: diameterMm ?? 0, material: 'HDPE', pipeClass: null, scope: 'PROPOSED', surface: null, crossing: null });
        break;
      }
      case 'VALVES':
        if (f[1] && f[2]) valves.push({ code: f[0], a: f[1], b: f[2] });
        break;
      case 'PUMPS':
        pumps++;
        break;
      case 'COORDINATES': {
        const x = finite(f[1]);
        const y = finite(f[2]);
        if (x !== null && y !== null) coords.set(f[0], [x, y]);
        break;
      }
    }
  }
  if (us) {
    for (const p of pipes) {
      p.lengthM = round3(p.lengthM * 0.3048);
      p.diameterMm = Math.round(p.diameterMm * 25.4);
    }
    for (const n of nodes.values()) if (n.groundLevel !== null) n.groundLevel = round3(n.groundLevel * 0.3048);
    notes.push('Lengths and levels were in feet and diameters in inches: changed to metres and millimetres');
  } else {
    for (const p of pipes) p.diameterMm = Math.round(p.diameterMm);
  }
  for (const n of nodes.values()) {
    const c = coords.get(n.code);
    if (c) [n.x, n.y] = c;
  }
  for (const v of valves) {
    if (nodes.has(v.code)) continue;
    const a = coords.get(v.a);
    const b = coords.get(v.b);
    nodes.set(v.code, { code: v.code, kind: 'SLUICE_VALVE', groundLevel: nodes.get(v.a)?.groundLevel ?? null, x: a && b ? (a[0] + b[0]) / 2 : null, y: a && b ? (a[1] + b[1]) / 2 : null, chainage: null });
  }
  if (valves.length) notes.push(`${valves.length} valve${valves.length === 1 ? '' : 's'} kept as valve points between their two junctions`);
  if (pumps) notes.push(`${pumps} pump${pumps === 1 ? '' : 's'} left out: a pump is not a length of pipe`);
  return { nodes: [...nodes.values()], pipes, notes };
}

const KEY = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const cell = (row: Record<string, unknown>, names: string[]): unknown => {
  for (const [k, v] of Object.entries(row)) if (names.includes(KEY(k))) return v;
  return undefined;
};
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const nodeKindOf = (v: unknown): PipeNodeKind => {
  const t = KEY(text(v));
  if (!t) return 'JUNCTION';
  const exact = PIPE_NODE_KINDS.find((k) => KEY(k) === t);
  if (exact) return exact;
  if (/tank|oht|esr|gsr|sump/.test(t)) return 'TANK';
  if (/source|reservoir|wtp/.test(t)) return 'SOURCE';
  if (/air/.test(t)) return 'AIR_VALVE';
  if (/scour|washout/.test(t)) return 'SCOUR';
  if (/valve|sv|gate/.test(t)) return 'SLUICE_VALVE';
  if (/chamber/.test(t)) return 'CHAMBER';
  if (/crossing|pit/.test(t)) return 'CROSSING_PIT';
  if (/end|cap/.test(t)) return 'END';
  return 'JUNCTION';
};
const materialOf = (v: unknown): PipeMaterial => {
  const t = KEY(text(v));
  return PIPE_MATERIALS.find((m) => t.startsWith(KEY(m))) ?? (t ? 'OTHER' : 'HDPE');
};

/**
 * An Excel book of two sheets, nodes and pipes, read as rows keyed by their header. Headers are matched loosely
 * ("Node", "Junction ID", "Code"; "From node", "Start"; "Dia (mm)"), so a pipe sheet as the design office sends it
 * reads without editing. A pipe marked existing is drawn but carries no work.
 */
export function parseNetworkSheets(nodeRows: Record<string, unknown>[], pipeRows: Record<string, unknown>[]): PipeNetworkFile {
  const nodes: PipeNodeInput[] = [];
  for (const r of nodeRows) {
    const code = text(cell(r, ['code', 'id', 'node', 'nodeid', 'nodeno', 'nodecode', 'junction', 'junctionid', 'junctionno', 'name']));
    if (!code) continue;
    nodes.push({
      code,
      kind: nodeKindOf(cell(r, ['kind', 'type', 'nodetype'])),
      groundLevel: finite(cell(r, ['groundlevel', 'gl', 'elevation', 'elev', 'rl', 'levelm', 'level'])),
      x: finite(cell(r, ['x', 'xcoord', 'xcoordinate', 'easting', 'lng', 'longitude'])),
      y: finite(cell(r, ['y', 'ycoord', 'ycoordinate', 'northing', 'lat', 'latitude'])),
      chainage: finite(cell(r, ['chainage', 'ch', 'chainagem'])),
    });
  }
  const pipes: PipeSegmentInput[] = [];
  for (const r of pipeRows) {
    const code = text(cell(r, ['code', 'id', 'pipe', 'pipeid', 'pipeno', 'pipecode', 'link', 'linkid', 'linkno', 'name']));
    if (!code) continue;
    const scope = text(cell(r, ['scope', 'status', 'proposedexisting']));
    pipes.push({
      code,
      from: text(cell(r, ['from', 'fromnode', 'startnode', 'start', 'node1', 'upstream'])),
      to: text(cell(r, ['to', 'tonode', 'endnode', 'end', 'node2', 'downstream'])),
      lengthM: finite(cell(r, ['length', 'lengthm', 'len', 'lengthmtr'])) ?? 0,
      diameterMm: Math.round(finite(cell(r, ['diameter', 'diametermm', 'dia', 'diamm', 'od', 'odmm', 'size'])) ?? 0),
      material: materialOf(cell(r, ['material', 'pipematerial', 'type'])),
      pipeClass: text(cell(r, ['class', 'pipeclass', 'pn', 'rating'])) || null,
      scope: /exist/i.test(scope) ? 'EXISTING' : 'PROPOSED',
      surface: text(cell(r, ['surface', 'road', 'roadtype'])) || null,
      crossing: text(cell(r, ['crossing'])) || null,
    });
  }
  return { nodes, pipes, notes: [] };
}

/** What stops a network from being saved: repeated codes, pipes to nowhere, no length or diameter. */
export function networkProblems(file: Pick<PipeNetworkFile, 'nodes' | 'pipes'>, known: Iterable<string> = []): string[] {
  const problems: string[] = [];
  if (!file.pipes.length) problems.push('The file has no pipes');
  if (file.nodes.length > MAX_NETWORK_SIZE || file.pipes.length > MAX_NETWORK_SIZE) problems.push(`Import at most ${MAX_NETWORK_SIZE} nodes and ${MAX_NETWORK_SIZE} pipes at a time`);
  const seen = new Set<string>();
  for (const n of file.nodes) {
    if (seen.has(n.code)) problems.push(`Node ${n.code} is in the file twice`);
    seen.add(n.code);
  }
  const nodeCodes = new Set([...seen, ...known]);
  const pipeCodes = new Set<string>();
  for (const p of file.pipes) {
    if (pipeCodes.has(p.code)) problems.push(`Pipe ${p.code} is in the file twice`);
    if (seen.has(p.code)) problems.push(`${p.code} is both a node and a pipe`);
    pipeCodes.add(p.code);
    if (!p.from || !nodeCodes.has(p.from)) problems.push(`Pipe ${p.code} starts at ${p.from || 'no node'}, which is not in the file`);
    if (!p.to || !nodeCodes.has(p.to)) problems.push(`Pipe ${p.code} ends at ${p.to || 'no node'}, which is not in the file`);
    if (p.from && p.from === p.to) problems.push(`Pipe ${p.code} starts and ends at ${p.from}`);
    if (!(p.lengthM > 0)) problems.push(`Pipe ${p.code} has no length`);
    if (!(p.diameterMm > 0)) problems.push(`Pipe ${p.code} has no diameter`);
  }
  return problems.slice(0, 50);
}

export interface NetworkImportPlan {
  nodes: { added: number; changed: number; unchanged: number };
  pipes: { added: number; changed: number; unchanged: number };
  /** Pipes already saved that the file leaves out: kept as they are, with their progress */
  notInFile: string[];
  /** Pipes whose length the file shortens below the work already recorded on them */
  shortened: string[];
}

/**
 * What saving a file would do to the network already there, matched by code so progress stays with its pipe: new,
 * changed and unchanged nodes and pipes, the pipes the file leaves out (kept), and any it would make shorter than the
 * work recorded on them (`doneM`, the most metres of any stage).
 */
export function importPlan(
  existing: { nodes: (PipeNodeInput & { zoneId?: string })[]; pipes: (PipeSegmentInput & { doneM?: number })[] },
  file: Pick<PipeNetworkFile, 'nodes' | 'pipes'>,
): NetworkImportPlan {
  const oldNodes = new Map(existing.nodes.map((n) => [n.code, n]));
  const oldPipes = new Map(existing.pipes.map((p) => [p.code, p]));
  const plan: NetworkImportPlan = { nodes: { added: 0, changed: 0, unchanged: 0 }, pipes: { added: 0, changed: 0, unchanged: 0 }, notInFile: [], shortened: [] };
  for (const n of file.nodes) {
    const o = oldNodes.get(n.code);
    if (!o) plan.nodes.added++;
    else if (o.kind !== n.kind || o.groundLevel !== n.groundLevel || o.x !== n.x || o.y !== n.y || o.chainage !== n.chainage) plan.nodes.changed++;
    else plan.nodes.unchanged++;
  }
  const inFile = new Set<string>();
  for (const p of file.pipes) {
    inFile.add(p.code);
    const o = oldPipes.get(p.code);
    if (!o) {
      plan.pipes.added++;
      continue;
    }
    const same = o.from === p.from && o.to === p.to && round3(o.lengthM) === round3(p.lengthM) && o.diameterMm === p.diameterMm && o.material === p.material && o.scope === p.scope && (o.pipeClass ?? null) === (p.pipeClass ?? null);
    if (same) plan.pipes.unchanged++;
    else plan.pipes.changed++;
    if ((o.doneM ?? 0) > p.lengthM + 0.001) plan.shortened.push(p.code);
  }
  for (const code of oldPipes.keys()) if (!inFile.has(code)) plan.notInFile.push(code);
  plan.notInFile.sort(comparePipeCodes);
  plan.shortened.sort(comparePipeCodes);
  return plan;
}

/* ---------- figures ---------- */

/** Metres done per stage on one segment (approved work), and whether a passed hydraulic test covers it. */
export interface SegmentWork {
  done: Partial<Record<SegmentStage, number>>;
  tested?: boolean;
}

export interface SegmentStatus {
  /** Metres per stage, held to the segment's length; TEST is the whole length once a passed test covers it */
  done: Record<SegmentStage, number>;
  /** The segment's own %, the stages weighted by PIPE_STAGE_WEIGHTS */
  pct: number;
  /** The last stage done end to end, in stage order; null when none is */
  furthest: SegmentStage | null;
  started: boolean;
}

export function segmentStatus(lengthM: number, work: SegmentWork): SegmentStatus {
  const done = {} as Record<SegmentStage, number>;
  let weighted = 0;
  let furthest: SegmentStage | null = null;
  let started = false;
  for (const s of SEGMENT_STAGES) {
    const raw = s === 'TEST' && work.tested ? lengthM : (work.done[s] ?? 0);
    const m = round3(Math.max(0, Math.min(lengthM, raw)));
    done[s] = m;
    if (m > 0) started = true;
    if (lengthM > 0) weighted += (PIPE_STAGE_WEIGHTS[s] * m) / lengthM;
    if (lengthM > 0 && m >= lengthM - 0.001) furthest = s;
  }
  return { done, pct: Math.round(weighted * 10) / 10, furthest, started };
}

export interface ZoneTableRow {
  key: string;
  diameterMm: number;
  material: PipeMaterial;
  pipes: number;
  scopeM: number;
  trenchedM: number;
  laidM: number;
  testedM: number;
  restoredM: number;
  /** Still to lay */
  balanceM: number;
}

/**
 * A zone in the shape of the site's pipe sheet: one row per diameter and material, largest first, with scope,
 * trenched, laid, tested, restored and the balance still to lay, and a total row. Existing pipes are left out.
 */
export function zoneTable(segments: { diameterMm: number; material: PipeMaterial; lengthM: number; scope: PipeScope; status: SegmentStatus }[]): { rows: ZoneTableRow[]; total: ZoneTableRow } {
  const rows = new Map<string, ZoneTableRow>();
  const blank = (key: string, diameterMm: number, material: PipeMaterial): ZoneTableRow => ({ key, diameterMm, material, pipes: 0, scopeM: 0, trenchedM: 0, laidM: 0, testedM: 0, restoredM: 0, balanceM: 0 });
  const total = blank('total', 0, 'OTHER');
  for (const s of segments) {
    if (s.scope !== 'PROPOSED') continue;
    const key = `${s.diameterMm}-${s.material}`;
    const row = rows.get(key) ?? blank(key, s.diameterMm, s.material);
    rows.set(key, row);
    for (const r of [row, total]) {
      r.pipes++;
      r.scopeM += s.lengthM;
      r.trenchedM += s.status.done.TRENCH;
      r.laidM += s.status.done.LAY_JOINT;
      r.testedM += s.status.done.TEST;
      r.restoredM += s.status.done.RESTORATION;
    }
  }
  const tidy = (r: ZoneTableRow) => {
    for (const k of ['scopeM', 'trenchedM', 'laidM', 'testedM', 'restoredM'] as const) r[k] = round3(r[k]);
    r.balanceM = round3(r.scopeM - r.laidM);
    return r;
  };
  return { rows: [...rows.values()].sort((a, b) => b.diameterMm - a.diameterMm || a.material.localeCompare(b.material)).map(tidy), total: tidy(total) };
}

export interface WorkingFront {
  segmentId: string;
  code: string;
  /** The node the front starts from */
  fromCode: string;
  /** The laid pipe that reaches that node, or null when it is a tank or source */
  viaCode: string | null;
}

/**
 * Segments ready to start: proposed, not yet trenched or laid, with an end at a tank or source or at a pipe that is
 * already laid end to end. Listed in code order.
 */
export function workingFronts(
  segments: { id: string; code: string; fromCode: string; toCode: string; scope: PipeScope; status: SegmentStatus; lengthM: number }[],
  nodes: { code: string; kind: PipeNodeKind }[],
): WorkingFront[] {
  const sources = new Set(nodes.filter((n) => SOURCE_NODE_KINDS.includes(n.kind)).map((n) => n.code));
  const reachedBy = new Map<string, string>();
  for (const s of segments) {
    if (s.lengthM > 0 && s.status.done.LAY_JOINT >= s.lengthM - 0.001) {
      if (!reachedBy.has(s.fromCode)) reachedBy.set(s.fromCode, s.code);
      if (!reachedBy.has(s.toCode)) reachedBy.set(s.toCode, s.code);
    }
  }
  const fronts: WorkingFront[] = [];
  for (const s of segments) {
    if (s.scope !== 'PROPOSED' || s.status.done.TRENCH > 0 || s.status.done.LAY_JOINT > 0) continue;
    const end = [s.fromCode, s.toCode].find((c) => reachedBy.has(c)) ?? [s.fromCode, s.toCode].find((c) => sources.has(c));
    if (!end) continue;
    fronts.push({ segmentId: s.id, code: s.code, fromCode: end, viaCode: reachedBy.get(end) ?? null });
  }
  return fronts.sort((a, b) => comparePipeCodes(a.code, b.code));
}

/**
 * A DPR line on a segment may not take a stage past the segment's length. `already` is what other entries (approved or
 * waiting) hold on that segment and stage; null when the line fits.
 */
export function segmentCapProblem(seg: { code: string; lengthM: number }, stage: SegmentStage, already: number, adding: number, lineNo: number): string | null {
  if (already + adding <= seg.lengthM + 0.001) return null;
  const left = Math.max(0, round3(seg.lengthM - already));
  const verb = PIPE_STAGE_LABELS[stage].toLowerCase();
  return already > 0
    ? `Line ${lineNo}: ${seg.code} is ${round3(seg.lengthM)} m long and ${round3(already)} m is already ${verb}; at most ${left} m is left`
    : `Line ${lineNo}: ${seg.code} is ${round3(seg.lengthM)} m long; enter at most ${round3(seg.lengthM)} m`;
}

export interface PipelineSummaryRow {
  key: string;
  zone: string;
  diameterMm: number;
  /** Metres per stage today */
  metres: Partial<Record<SegmentStage, number>>;
  valves: number;
}

/** A DPR's pipeline summary: today's metres per stage, per zone and diameter, from the lines on segments. */
export function pipelineSummary(lines: { pipeStage: PipeStage | null; segmentDiameterMm: number | null; componentName: string | null; subComponentName: string | null; quantity: string | number; pipeNodeId?: string | null }[]): PipelineSummaryRow[] {
  const rows = new Map<string, PipelineSummaryRow>();
  for (const l of lines) {
    if (!l.pipeStage) continue;
    const zone = l.subComponentName ?? l.componentName ?? '';
    if (l.pipeStage === 'VALVES') {
      if (!l.pipeNodeId) continue;
      const key = `${zone}|valves`;
      const row = rows.get(key) ?? { key, zone, diameterMm: 0, metres: {}, valves: 0 };
      row.valves += Number(l.quantity) || 0;
      rows.set(key, row);
      continue;
    }
    if (!l.segmentDiameterMm) continue;
    const key = `${zone}|${l.segmentDiameterMm}`;
    const row = rows.get(key) ?? { key, zone, diameterMm: l.segmentDiameterMm, metres: {}, valves: 0 };
    row.metres[l.pipeStage] = round3((row.metres[l.pipeStage] ?? 0) + (Number(l.quantity) || 0));
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.zone.localeCompare(b.zone) || b.diameterMm - a.diameterMm);
}

/* ---------- API shapes ---------- */

export interface PipeNodeDto {
  id: string;
  zoneId: string;
  code: string;
  kind: PipeNodeKind;
  groundLevel: string | null;
  x: number | null;
  y: number | null;
  chainage: number | null;
  /** A valve or fitting fixed (a VALVES line on it was approved) */
  fixed: boolean;
}

export interface PipeSegmentDto {
  id: string;
  zoneId: string;
  code: string;
  fromNodeId: string;
  fromCode: string;
  toNodeId: string;
  toCode: string;
  lengthM: string;
  diameterMm: number;
  material: PipeMaterial;
  pipeClass: string | null;
  scope: PipeScope;
  surface: string | null;
  crossing: string | null;
  status: SegmentStatus;
  /** Metres per stage on lines still waiting for approval */
  waiting: Partial<Record<SegmentStage, number>>;
}

export interface PipeZoneDto {
  id: string;
  code: string;
  name: string;
  /** "Distribution network, HDPE › Zone 2" when it is a sub-component */
  label: string;
  elementType: WorkElementType;
  nodes: number;
  pipes: number;
  /** The zone's activities that stand for each stage, so a DPR line can be written against them */
  stageActivities: Partial<Record<PipeStage, string>>;
  table: { rows: ZoneTableRow[]; total: ZoneTableRow };
  fronts: WorkingFront[];
  /** Metres recorded on the zone's stage activities without a segment (before the network was loaded) */
  unplacedM: Partial<Record<SegmentStage, number>>;
}

export interface PipeNetworkDto {
  projectId: string;
  zones: PipeZoneDto[];
  nodes: PipeNodeDto[];
  segments: PipeSegmentDto[];
  /** The user may load and correct the network */
  canEdit: boolean;
}

export interface PipeNetworkImportBody {
  projectId: string;
  zoneId: string;
  nodes: PipeNodeInput[];
  pipes: PipeSegmentInput[];
  /** Only work out what saving would do */
  dryRun?: boolean;
}

export interface PipeNetworkImportResultDto {
  plan: NetworkImportPlan;
  problems: string[];
  saved: boolean;
  /** Total proposed length of the zone after the import, m: its length stages are planned at this */
  proposedM: number;
}
