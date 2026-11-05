/**
 * Pipe network: a pipe zone's or main's hydraulic model, junctions and the pipes between them, and how far
 * each stage of work has got on each pipe. Reading a model file (EPANET .inp, an Excel book of nodes and pipes, or a
 * Google Earth KMZ / KML alignment),
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

// Reading a model

export interface PipeNodeInput {
  code: string;
  kind: PipeNodeKind;
  groundLevel: number | null;
  x: number | null;
  y: number | null;
  chainage: number | null;
  /** Where it is on the earth, from a Google Earth file or a sheet's latitude and longitude; left out keeps what is saved */
  lat?: number | null;
  lon?: number | null;
}

/** A pipe's route between its two ends as [longitude, latitude] points, the bends a Google Earth line drew. */
export type PipeRoute = [number, number][];

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
  /** Its bends between its ends; left out keeps what is saved */
  path?: PipeRoute | null;
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
  // The short names on site drawings, as a word of their own or before a number: AV-01, WO 2, SC3, BFV-1, NRV.
  const abbr = (re: string) => new RegExp(`(^|[^a-z])(${re})(\\d|[^a-z]|$)`).test(text(v).toLowerCase());
  if (abbr('av|arv|dav|kav')) return 'AIR_VALVE';
  if (abbr('wo|sc|scv|so')) return 'SCOUR';
  if (abbr('sv|gv|bv|bfv|nrv|prv|cv')) return 'SLUICE_VALVE';
  if (/tank|oht|esr|gsr|sump/.test(t)) return 'TANK';
  if (/source|reservoir|wtp|intake/.test(t)) return 'SOURCE';
  if (/air/.test(t)) return 'AIR_VALVE';
  if (/scour|washout/.test(t)) return 'SCOUR';
  if (/valve|sv|gate/.test(t)) return 'SLUICE_VALVE';
  if (/chamber/.test(t)) return 'CHAMBER';
  if (/crossing|pit/.test(t)) return 'CROSSING_PIT';
  if (/end|cap/.test(t)) return 'END';
  return 'JUNCTION';
};
/** A chainage cell in whole metres, as the site writes it (1+250) or as a number (1250.4). */
const chainageOf = (v: unknown): number | null => {
  const km = /^\s*(\d+)\s*\+\s*(\d+(?:\.\d+)?)\s*$/.exec(text(v));
  const m = km ? Number(km[1]) * 1000 + Number(km[2]) : finite(v);
  return m === null ? null : Math.round(m);
};
const materialOf = (v: unknown): PipeMaterial => {
  const t = KEY(text(v));
  return PIPE_MATERIALS.find((m) => t.startsWith(KEY(m))) ?? (t ? 'OTHER' : 'HDPE');
};

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;
/** A latitude and longitude pair, kept only when both are on the earth. */
const latLonOf = (lat: number | null, lon: number | null): Pick<PipeNodeInput, 'lat' | 'lon'> =>
  lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon) ? { lat: round7(lat), lon: round7(lon) } : {};
/** A route cell, "lon,lat lon,lat ...", as the sheet download writes it; an empty cell leaves the saved route alone. */
const routeOf = (v: string): Pick<PipeSegmentInput, 'path'> => {
  if (!v) return {};
  const path = v
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90)
    .map((c) => [round7(c[0]), round7(c[1])] as [number, number]);
  return { path: path.slice(0, MAX_ROUTE_POINTS) };
};
/** Most bends kept on one pipe's route. */
export const MAX_ROUTE_POINTS = 500;

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
      chainage: chainageOf(cell(r, ['chainage', 'ch', 'chainagem'])),
      ...latLonOf(finite(cell(r, ['lat', 'latitude'])), finite(cell(r, ['lon', 'lng', 'long', 'longitude']))),
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
      ...routeOf(text(cell(r, ['route', 'path']))),
    });
  }
  return { nodes, pipes, notes: [] };
}

// Reading an alignment from Google Earth

/** What a KML line does not say for itself: the pipe's diameter and material, and how long a segment to cut it into. */
export interface KmlDefaults {
  diameterMm: number;
  material: PipeMaterial;
  scope?: PipeScope;
  /** Segment length in metres between named points (default 500) */
  splitM?: number;
}

/** A named point closer than this to a line becomes a node on it, at its chainage. */
export const KML_SNAP_M = 25;
const EARTH_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The ground distance in metres between two places given as [longitude, latitude] (haversine). */
export function groundDistanceM(a: readonly [number, number, ...(number | null)[]], b: readonly [number, number, ...(number | null)[]]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A chainage as the site writes it: 1250 m is 1+250. */
export const chainageLabel = (m: number) => `${Math.floor(Math.round(m) / 1000)}+${String(Math.round(m) % 1000).padStart(3, '0')}`;

const xmlText = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
const tagRe = (tag: string) => new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'gi');
const inner = (xml: string, tag: string) => [...xml.matchAll(tagRe(tag))].map((m) => m[1]);
type Coord = [number, number, number | null];
const coordsOf = (s: string): Coord[] =>
  s
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map((v) => Number(v)))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90)
    .map((c) => [c[0], c[1], c.length > 2 && Number.isFinite(c[2]) ? c[2] : null]);
const dataOf = (pm: string) => {
  const out: Record<string, string> = {};
  for (const m of pm.matchAll(/<(?:[\w-]+:)?Data\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Data>/gi)) out[KEY(m[1])] = xmlText(inner(m[2], 'value')[0] ?? m[2]);
  for (const m of pm.matchAll(/<(?:[\w-]+:)?SimpleData\b[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?SimpleData>/gi)) out[KEY(m[1])] = xmlText(m[2]);
  return out;
};
const pick = (data: Record<string, string>, names: string[]) => names.map((n) => data[n]).find((v) => v !== undefined && v !== '');
const codeOf = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 40);

/**
 * A pipeline drawn in Google Earth (KML, the file inside a KMZ): each line becomes a run of segments with its chainage
 * from its start, measured on the ground. A named point within 25 m of a line (a sluice valve, an air valve, a tank)
 * becomes a node at its chainage, named and of its kind by its name; between them the line is cut every 500 m, at nodes
 * named by chainage (0+500). The diameter and material come from the line's own data or its name ("300 mm DI"), else
 * the defaults given. Places are kept in metres east and north of the first point, so the map draws them to scale, and
 * on the earth (each node's latitude and longitude, each pipe's bends), so the network can go back to Google Earth.
 * A line whose data names its two ends (`from`, `to`: the network's own download, `networkKml`) is one pipe with its
 * code, size and length as written, between the points of those names, so a downloaded network reads back as it was.
 */
export function parseKml(xml: string, defaults: KmlDefaults): PipeNetworkFile {
  const notes: string[] = [];
  const splitM = defaults.splitM && defaults.splitM > 0 ? defaults.splitM : 500;
  const lines: { name: string; data: Record<string, string>; coords: Coord[] }[] = [];
  const points: { name: string; data: Record<string, string>; at: Coord }[] = [];
  for (const pm of inner(xml, 'Placemark')) {
    const name = xmlText(inner(pm, 'name')[0] ?? '');
    const data = dataOf(pm);
    const ls = inner(pm, 'LineString');
    ls.forEach((l, i) => {
      const coords = coordsOf(inner(l, 'coordinates')[0] ?? '').filter((c, k, all) => !k || c[0] !== all[k - 1][0] || c[1] !== all[k - 1][1]);
      if (coords.length >= 2) lines.push({ name: ls.length > 1 ? `${name || 'Line'} ${i + 1}` : name, data, coords });
    });
    if (!ls.length)
      for (const p of inner(pm, 'Point')) {
        const c = coordsOf(inner(p, 'coordinates')[0] ?? '')[0];
        if (c) points.push({ name, data, at: c });
      }
  }
  if (!lines.length) {
    notes.push('The file has no line: draw the main as a path in Google Earth and save it as KMZ or KML');
    return { nodes: [], pipes: [], notes };
  }
  const [lon0, lat0] = lines[0].coords[0];
  const ky = rad(1) * EARTH_M;
  const kx = Math.cos(rad(lat0)) * ky;
  const local = (c: Coord): [number, number] => [(c[0] - lon0) * kx, (c[1] - lat0) * ky];
  const onEarth = (lon: number, lat: number) => ({ lat: round7(lat), lon: round7(lon) });

  const nodes: PipeNodeInput[] = [];
  const pipes: PipeSegmentInput[] = [];
  const taken = new Set<string>();
  const unique = (code: string) => {
    let c = code || 'Node';
    for (let n = 2; taken.has(c); n++) c = `${code.slice(0, 36)}-${n}`;
    taken.add(c);
    return c;
  };

  // Lines that are one pipe each, between the points their data names.
  const isPipe = (l: (typeof lines)[number]) => !!pick(l.data, ['from', 'fromnode']) && !!pick(l.data, ['to', 'tonode']);
  const pointOf = new Map(points.map((p) => [codeOf(p.name), p]));
  const used = new Set<(typeof points)[number]>();
  const endNode = (code: string, at: Coord) => {
    if (nodes.some((n) => n.code === code)) return code;
    const pt = pointOf.get(code);
    if (pt) used.add(pt);
    const c = pt?.at ?? at;
    const [x, y] = local(c);
    const kind = pt ? PIPE_NODE_KINDS.find((k) => k === (pt.data.kind ?? '').toUpperCase()) : undefined;
    taken.add(code);
    nodes.push({
      code,
      kind: kind ?? nodeKindOf(code),
      groundLevel: pt ? finite(pick(pt.data, ['groundlevel', 'gl', 'level'])) : null,
      x: round2(x),
      y: round2(y),
      chainage: pt ? chainageOf(pick(pt.data, ['chainage', 'ch'])) : null,
      ...onEarth(c[0], c[1]),
    });
    return code;
  };
  const piped = lines.filter(isPipe);
  for (const l of piped) {
    const ends = [codeOf(pick(l.data, ['from', 'fromnode'])!), codeOf(pick(l.data, ['to', 'tonode'])!)];
    const from = endNode(ends[0], l.coords[0]);
    const to = endNode(ends[1], l.coords[l.coords.length - 1]);
    let measured = 0;
    for (let k = 1; k < l.coords.length; k++) measured += groundDistanceM(l.coords[k - 1], l.coords[k]);
    const scope = pick(l.data, ['scope']);
    const code = codeOf(pick(l.data, ['code', 'pipe']) ?? l.name);
    taken.add(code);
    pipes.push({
      code,
      from,
      to,
      lengthM: round3(finite(pick(l.data, ['lengthm', 'length'])) ?? round1(measured)),
      diameterMm: Math.round(finite(pick(l.data, ['diametermm', 'diameter', 'dia'])) ?? defaults.diameterMm),
      material: pick(l.data, ['material']) ? materialOf(pick(l.data, ['material'])) : defaults.material,
      pipeClass: pick(l.data, ['class', 'pipeclass'])?.slice(0, 40) ?? null,
      scope: scope && /exist/i.test(scope) ? 'EXISTING' : (defaults.scope ?? 'PROPOSED'),
      surface: pick(l.data, ['surface'])?.slice(0, 60) ?? null,
      crossing: pick(l.data, ['crossing'])?.slice(0, 80) ?? null,
      path: l.coords.slice(1, -1).map((c) => [round7(c[0]), round7(c[1])] as [number, number]),
    });
  }
  if (piped.length) notes.push(`${piped.length} pipe${piped.length === 1 ? '' : 's'} read with ${piped.length === 1 ? 'its' : 'their'} own code, size and ends`);

  // Each drawn line's chainage at each of its points, and where each named point falls on the nearest line.
  const runs = lines
    .filter((l) => !isPipe(l))
    .map((l) => {
      const ch = [0];
      for (let k = 1; k < l.coords.length; k++) ch.push(ch[k - 1] + groundDistanceM(l.coords[k - 1], l.coords[k]));
      return { ...l, xy: l.coords.map(local), ch, length: ch[ch.length - 1], marks: [] as { at: number; name: string }[] };
    });
  let far = 0;
  for (const p of points) {
    if (used.has(p)) continue;
    const pxy = local(p.at);
    let best: { run: number; at: number; d: number } | null = null;
    runs.forEach((r, ri) => {
      for (let k = 0; k + 1 < r.xy.length; k++) {
        const [ax, ay] = r.xy[k];
        const [bx, by] = r.xy[k + 1];
        const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
        const t = len2 ? Math.max(0, Math.min(1, ((pxy[0] - ax) * (bx - ax) + (pxy[1] - ay) * (by - ay)) / len2)) : 0;
        const d = Math.hypot(pxy[0] - (ax + t * (bx - ax)), pxy[1] - (ay + t * (by - ay)));
        if (!best || d < best.d) best = { run: ri, at: r.ch[k] + t * (r.ch[k + 1] - r.ch[k]), d };
      }
    });
    const b = best as { run: number; at: number; d: number } | null;
    if (b && b.d <= KML_SNAP_M) runs[b.run].marks.push({ at: b.at, name: p.name });
    else far++;
  }

  const many = runs.length > 1;
  runs.forEach((r, ri) => {
    const prefix = many ? `L${ri + 1}-` : '';
    // Where the line is cut: its ends, its named points, and every splitM between.
    const cuts: { at: number; name: string | null }[] = [{ at: 0, name: null }, { at: r.length, name: null }];
    for (const m of r.marks) {
      const end = cuts.find((c) => Math.abs(c.at - m.at) < 1);
      if (end) end.name ??= m.name || null;
      else cuts.push({ at: m.at, name: m.name || null });
    }
    for (let at = splitM; at < r.length - splitM / 5; at += splitM) if (!cuts.some((c) => Math.abs(c.at - at) < splitM / 5)) cuts.push({ at, name: null });
    cuts.sort((a, b) => a.at - b.at);
    const alts = r.coords.some((c) => c[2]);
    const placeAt = (at: number) => {
      let k = 0;
      while (k + 2 < r.ch.length && r.ch[k + 1] < at) k++;
      const span = r.ch[k + 1] - r.ch[k];
      const t = span ? Math.max(0, Math.min(1, (at - r.ch[k]) / span)) : 0;
      const lerp = (a: number, b: number) => a + t * (b - a);
      const a = r.coords[k][2];
      const b = r.coords[k + 1][2];
      return {
        x: round2(lerp(r.xy[k][0], r.xy[k + 1][0])),
        y: round2(lerp(r.xy[k][1], r.xy[k + 1][1])),
        level: alts && a !== null && b !== null ? round2(lerp(a, b)) : null,
        ...onEarth(lerp(r.coords[k][0], r.coords[k + 1][0]), lerp(r.coords[k][1], r.coords[k + 1][1])),
      };
    };
    const codes = cuts.map((c, ci) => {
      const { x, y, level, lat, lon } = placeAt(c.at);
      // A line that starts or ends where another did joins it there.
      if ((ci === 0 || ci === cuts.length - 1) && !c.name) {
        const near = nodes.find((n) => n.x !== null && n.y !== null && Math.hypot(n.x - x, n.y - y) <= 5);
        if (near) return near.code;
      }
      const code = unique(c.name ? codeOf(c.name) : `${prefix}${chainageLabel(c.at)}`);
      nodes.push({ code, kind: c.name ? nodeKindOf(c.name) : 'JUNCTION', groundLevel: level, x, y, chainage: Math.round(c.at), lat, lon });
      return code;
    });
    const dia = finite(pick(r.data, ['diameter', 'diametermm', 'dia', 'diamm', 'size', 'od', 'odmm', 'dn'])) ?? finite(/(\d{2,4})\s*(?:mm|ø)/i.exec(r.name)?.[1] ?? /\b(?:dia|dn|ø)\s*(\d{2,4})/i.exec(r.name)?.[1]);
    const matText = pick(r.data, ['material', 'pipematerial']);
    const matInName = PIPE_MATERIALS.find((m) => m !== 'OTHER' && new RegExp(`\\b${m}\\b`, 'i').test(r.name));
    const pipeClass = pick(r.data, ['class', 'pipeclass', 'pn', 'rating']) ?? /\b(PN\s?\d+(?:\.\d+)?|K\s?[79])\b/i.exec(r.name)?.[1] ?? null;
    for (let k = 0; k + 1 < cuts.length; k++) {
      pipes.push({
        code: unique(`${prefix}P${k + 1}`),
        from: codes[k],
        to: codes[k + 1],
        lengthM: round1(round1(cuts[k + 1].at) - round1(cuts[k].at)),
        diameterMm: Math.round(dia ?? defaults.diameterMm),
        material: matText ? materialOf(matText) : (matInName ?? defaults.material),
        pipeClass: pipeClass ? pipeClass.slice(0, 40) : null,
        scope: defaults.scope ?? 'PROPOSED',
        surface: null,
        crossing: null,
        // The line's own bends between the two cuts, so the pipe keeps its route on the earth.
        path: r.coords.filter((_, i) => r.ch[i] > cuts[k].at + 0.5 && r.ch[i] < cuts[k + 1].at - 0.5).map((c) => [round7(c[0]), round7(c[1])] as [number, number]),
      });
    }
    notes.push(`${r.name || `Line ${ri + 1}`}: ${(r.length / 1000).toFixed(2)} km on the ground, chainage 0+000 to ${chainageLabel(r.length)}`);
  });
  const named = runs.reduce((n, r) => n + r.marks.length, 0);
  if (named) notes.push(`${named} named point${named === 1 ? '' : 's'} kept as nodes at their chainage`);
  if (far) notes.push(`${far} point${far === 1 ? ' was' : 's were'} more than ${KML_SNAP_M} m from any line: left out`);
  return { nodes, pipes, notes };
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A zone's network as a Google Earth file (KML; the screen zips it into a KMZ): each pipe a line from its start node
 * through its bends to its end node, with its code, ends, length and size in its data, and each node a point named by
 * its code with its kind, chainage and level. `parseKml` reads it back pipe for pipe. Only what has a place on the
 * earth goes in; `left` names the pipes that had none (a network loaded from EPANET or a sheet without latitudes).
 */
export function networkKml(name: string, file: Pick<PipeNetworkFile, 'nodes' | 'pipes'>): { kml: string; left: string[] } {
  const at = new Map(file.nodes.filter((n) => typeof n.lat === 'number' && typeof n.lon === 'number').map((n) => [n.code, n]));
  const data = (pairs: [string, string | number | null | undefined][]) =>
    `<ExtendedData>${pairs
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => `<Data name="${k}"><value>${xmlEscape(String(v))}</value></Data>`)
      .join('')}</ExtendedData>`;
  const left: string[] = [];
  const lines: string[] = [];
  const ends = new Set<string>();
  for (const p of file.pipes) {
    const a = at.get(p.from);
    const b = at.get(p.to);
    if (!a || !b) {
      left.push(p.code);
      continue;
    }
    ends.add(p.from).add(p.to);
    const coords = [[a.lon!, a.lat!], ...(p.path ?? []), [b.lon!, b.lat!]].map(([x, y]) => `${x},${y},0`).join(' ');
    lines.push(
      `<Placemark><name>${xmlEscape(p.code)}</name><description>${xmlEscape(`${p.diameterMm} mm ${p.material}${p.pipeClass ? ` ${p.pipeClass}` : ''}, ${p.lengthM} m`)}</description><styleUrl>#${p.scope === 'EXISTING' ? 'existing' : 'pipe'}</styleUrl>${data([
        ['code', p.code],
        ['from', p.from],
        ['to', p.to],
        ['length m', p.lengthM],
        ['diameter mm', p.diameterMm],
        ['material', p.material],
        ['class', p.pipeClass],
        ['scope', p.scope],
        ['surface', p.surface],
        ['crossing', p.crossing],
      ])}<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`,
    );
  }
  const points = file.nodes
    .filter((n) => at.has(n.code) && (ends.has(n.code) || n.kind !== 'JUNCTION'))
    .map(
      (n) =>
        `<Placemark><name>${xmlEscape(n.code)}</name>${data([
          ['kind', n.kind],
          ['chainage', n.chainage === null ? null : chainageLabel(n.chainage)],
          ['ground level', n.groundLevel],
        ])}<Point><coordinates>${n.lon},${n.lat},0</coordinates></Point></Placemark>`,
    );
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEscape(name)}</name>
<Style id="pipe"><LineStyle><color>ffd77800</color><width>3</width></LineStyle></Style>
<Style id="existing"><LineStyle><color>ff8c8c8c</color><width>2</width></LineStyle></Style>
<Folder><name>Pipes</name>
${lines.join('\n')}
</Folder>
<Folder><name>Nodes</name>
${points.join('\n')}
</Folder>
</Document></kml>
`;
  return { kml, left };
}

/**
 * A zone's network as the two sheets the Excel import reads (Nodes and Pipes, with latitude, longitude and each pipe's
 * route), so it can be corrected in Excel and loaded again, matched by code.
 */
export function networkSheets(file: Pick<PipeNetworkFile, 'nodes' | 'pipes'>): { nodes: (string | number | null)[][]; pipes: (string | number | null)[][] } {
  return {
    nodes: [
      ['Code', 'Kind', 'Ground level', 'X', 'Y', 'Chainage', 'Latitude', 'Longitude'],
      ...file.nodes.map((n) => [n.code, PIPE_NODE_KIND_NAMES[n.kind], n.groundLevel, n.x, n.y, n.chainage === null ? null : chainageLabel(n.chainage), n.lat ?? null, n.lon ?? null]),
    ],
    pipes: [
      ['Code', 'From', 'To', 'Length m', 'Diameter mm', 'Material', 'Class', 'Scope', 'Surface', 'Crossing', 'Route'],
      ...file.pipes.map((p) => [
        p.code,
        p.from,
        p.to,
        p.lengthM,
        p.diameterMm,
        p.material,
        p.pipeClass,
        p.scope === 'EXISTING' ? 'Existing' : 'Proposed',
        p.surface,
        p.crossing,
        p.path?.length ? p.path.map(([x, y]) => `${x},${y}`).join(' ') : null,
      ]),
    ],
  };
}

/** The node kinds as a sheet writes them, read back by their words. */
const PIPE_NODE_KIND_NAMES: Record<PipeNodeKind, string> = Object.fromEntries(PIPE_NODE_KINDS.map((k) => [k, k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ')])) as Record<PipeNodeKind, string>;

/** A zone's saved network as the import takes it, for a download or the editor. */
export function networkOf(nodes: PipeNodeDto[], segments: PipeSegmentDto[]): Pick<PipeNetworkFile, 'nodes' | 'pipes'> {
  return {
    nodes: nodes.map((n) => ({ code: n.code, kind: n.kind, groundLevel: n.groundLevel === null ? null : Number(n.groundLevel), x: n.x, y: n.y, chainage: n.chainage, lat: n.lat, lon: n.lon })),
    pipes: segments.map((s) => ({
      code: s.code,
      from: s.fromCode,
      to: s.toCode,
      lengthM: Number(s.lengthM),
      diameterMm: s.diameterMm,
      material: s.material,
      pipeClass: s.pipeClass,
      scope: s.scope,
      surface: s.surface,
      crossing: s.crossing,
      path: s.path,
    })),
  };
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
    if (p.path && p.path.length > MAX_ROUTE_POINTS) problems.push(`Pipe ${p.code} has more than ${MAX_ROUTE_POINTS} bends: cut it into shorter pipes`);
  }
  return problems.slice(0, 50);
}

/** A map position read again from the same place, up to its rounding to the centimetre. */
const nearly = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Math.abs(a - b) < 0.015);
/** A node a file places somewhere else on the earth; a file that gives no latitude leaves the saved one alone. */
const movedOnEarth = (o: Pick<PipeNodeInput, 'lat' | 'lon'>, n: Pick<PipeNodeInput, 'lat' | 'lon'>) =>
  (n.lat !== undefined && (o.lat ?? null) !== (n.lat === null ? null : round7(n.lat))) || (n.lon !== undefined && (o.lon ?? null) !== (n.lon === null ? null : round7(n.lon)));

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
    else if (o.kind !== n.kind || o.groundLevel !== n.groundLevel || !nearly(o.x, n.x) || !nearly(o.y, n.y) || o.chainage !== n.chainage || movedOnEarth(o, n)) plan.nodes.changed++;
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
    const same =
      o.from === p.from &&
      o.to === p.to &&
      round3(o.lengthM) === round3(p.lengthM) &&
      o.diameterMm === p.diameterMm &&
      o.material === p.material &&
      o.scope === p.scope &&
      (o.pipeClass ?? null) === (p.pipeClass ?? null) &&
      (o.surface ?? null) === (p.surface ?? null) &&
      (o.crossing ?? null) === (p.crossing ?? null) &&
      (p.path === undefined || JSON.stringify(o.path ?? []) === JSON.stringify(p.path ?? []));
    if (same) plan.pipes.unchanged++;
    else plan.pipes.changed++;
    if ((o.doneM ?? 0) > p.lengthM + 0.001) plan.shortened.push(p.code);
  }
  for (const code of oldPipes.keys()) if (!inFile.has(code)) plan.notInFile.push(code);
  plan.notInFile.sort(comparePipeCodes);
  plan.shortened.sort(comparePipeCodes);
  return plan;
}

// Figures

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

// API shapes

export interface PipeNodeDto {
  id: string;
  zoneId: string;
  code: string;
  kind: PipeNodeKind;
  groundLevel: string | null;
  x: number | null;
  y: number | null;
  chainage: number | null;
  lat: number | null;
  lon: number | null;
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
  /** Its bends between its ends on the earth, [longitude, latitude] */
  path: PipeRoute | null;
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
