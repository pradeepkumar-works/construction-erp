/**
 * Editing a pipe network on the map (ARCHITECTURE "Pipe network", Editing on the map): moving a node, adding a valve
 * on a pipe (the pipe cut in two at it, its length shared by the ground distance on each side), and drawing a new pipe
 * from a node. Each takes a zone's network as the import reads it and gives back the edited network, so the editor saves
 * only through the import, with its preview: matched by code, nothing deleted, no pipe cut below its work.
 */
import type { PipeNodeKind } from './enums';
import { groundDistanceM, type PipeNetworkFile, type PipeNodeInput, type PipeRoute, type PipeSegmentInput } from './pipe-network';

export type EditableNetwork = Pick<PipeNetworkFile, 'nodes' | 'pipes'>;
type LonLat = [number, number];

const EARTH_M = 6_371_008.8;
const M_PER_DEG = (Math.PI / 180) * EARTH_M;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round7 = (n: number) => Math.round(n * 1e7) / 1e7;
const placed = (n: PipeNodeInput | undefined): n is PipeNodeInput & { lat: number; lon: number } => !!n && typeof n.lat === 'number' && typeof n.lon === 'number';

/** A pipe on the earth: its start node, its bends, its end node; null where an end has no place. */
export function pipeRoute(net: EditableNetwork, p: PipeSegmentInput): PipeRoute | null {
  const a = net.nodes.find((n) => n.code === p.from);
  const b = net.nodes.find((n) => n.code === p.to);
  if (!placed(a) || !placed(b)) return null;
  return [[a.lon, a.lat], ...(p.path ?? []), [b.lon, b.lat]];
}

/** A route's length on the ground, m. */
export function routeLengthM(route: PipeRoute): number {
  let m = 0;
  for (let k = 1; k < route.length; k++) m += groundDistanceM(route[k - 1], route[k]);
  return m;
}

/**
 * The code that follows a network's own pattern: the highest number after the sample's prefix, plus one (P-27 among
 * P-1 to P-40 gives P-41), keeping its zero padding; never one already taken.
 */
export function nextNetworkCode(taken: Iterable<string>, sample: string): string {
  const codes = new Set(taken);
  const m = /^(.*?)(\d+)$/.exec(sample);
  const prefix = m ? m[1] : `${sample}-`;
  const width = m ? m[2].length : 1;
  let top = 0;
  for (const c of codes)
    if (c.startsWith(prefix)) {
      const n = /^\d+$/.exec(c.slice(prefix.length));
      if (n) top = Math.max(top, Number(n[0]));
    }
  let next = top + 1;
  const code = (n: number) => `${prefix}${String(n).padStart(width, '0')}`;
  while (codes.has(code(next))) next++;
  return code(next);
}

/** A place's position on the map in the network's own metres east and north, from any node placed both ways. */
function localOf(net: EditableNetwork, at: LonLat): { x: number | null; y: number | null } {
  const ref = net.nodes.find((n) => placed(n) && n.x !== null && n.y !== null);
  if (!placed(ref) || ref.x === null || ref.y === null) return { x: null, y: null };
  return { x: round2(ref.x + (at[0] - ref.lon) * M_PER_DEG * Math.cos((ref.lat * Math.PI) / 180)), y: round2(ref.y + (at[1] - ref.lat) * M_PER_DEG) };
}

/** A node put somewhere else on the earth; its map position moves with it. */
export function moveNode(net: EditableNetwork, code: string, to: LonLat): EditableNetwork {
  const n = net.nodes.find((x) => x.code === code);
  if (!n) return net;
  const lonLat = { lon: round7(to[0]), lat: round7(to[1]) };
  const moved: PipeNodeInput = placed(n) && n.x !== null && n.y !== null
    ? { ...n, ...lonLat, x: round2(n.x + (to[0] - n.lon) * M_PER_DEG * Math.cos((n.lat * Math.PI) / 180)), y: round2(n.y + (to[1] - n.lat) * M_PER_DEG) }
    : { ...n, ...lonLat, ...localOf(net, to) };
  return { ...net, nodes: net.nodes.map((x) => (x === n ? moved : x)) };
}

/** A pipe's bends redrawn; its ends stay on its nodes. */
export function reshapePipe(net: EditableNetwork, code: string, path: PipeRoute): EditableNetwork {
  return { ...net, pipes: net.pipes.map((p) => (p.code === code ? { ...p, path: path.map(([x, y]) => [round7(x), round7(y)] as LonLat) } : p)) };
}

/** Where a place falls on a route: the leg it is nearest, how far along that leg, and the nearest point itself. */
function nearestOnRoute(route: PipeRoute, at: LonLat): { leg: number; point: LonLat } {
  const kx = Math.cos((at[1] * Math.PI) / 180);
  let best = { leg: 0, point: route[0], d: Infinity };
  for (let k = 0; k + 1 < route.length; k++) {
    const [ax, ay] = [route[k][0] * kx, route[k][1]];
    const [bx, by] = [route[k + 1][0] * kx, route[k + 1][1]];
    const [px, py] = [at[0] * kx, at[1]];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
    const qx = ax + t * (bx - ax);
    const qy = ay + t * (by - ay);
    const d = Math.hypot(px - qx, py - qy);
    if (d < best.d) best = { leg: k, point: [qx / kx, qy], d };
  }
  return { leg: best.leg, point: best.point };
}

export interface SplitResult {
  network: EditableNetwork;
  /** Why the pipe could not be cut there, in words for the screen */
  problem: string | null;
}

/**
 * A valve, a chamber or a junction put on a pipe: the pipe keeps its code from its start to the new node and a new pipe
 * of the same size goes on to its end, the length shared by the ground distance each side. Work already recorded stays
 * with the first part; the import's preview says if that part is now shorter than its work.
 */
export function splitPipe(net: EditableNetwork, pipeCode: string, at: LonLat, node: { code: string; kind: PipeNodeKind }): SplitResult {
  const p = net.pipes.find((x) => x.code === pipeCode);
  if (!p) return { network: net, problem: `Pipe ${pipeCode} is not in this zone` };
  const route = pipeRoute(net, p);
  if (!route) return { network: net, problem: `${p.code} has no place on the map: import its KMZ again, or download and correct it in Excel` };
  const code = node.code.trim();
  if (!code) return { network: net, problem: 'Give the new point a code' };
  if (net.nodes.some((n) => n.code === code) || net.pipes.some((x) => x.code === code)) return { network: net, problem: `${code} is already in this network: give the new point another code` };
  const { leg, point } = nearestOnRoute(route, at);
  const first: PipeRoute = [...route.slice(0, leg + 1), point];
  const second: PipeRoute = [point, ...route.slice(leg + 1)];
  const d1 = routeLengthM(first);
  const d2 = routeLengthM(second);
  if (d1 < 0.5 || d2 < 0.5) return { network: net, problem: `That is at an end of ${p.code}: put the point along the pipe` };
  const lengthA = round1((p.lengthM * d1) / (d1 + d2));
  const share = d1 / (d1 + d2);
  const from = net.nodes.find((n) => n.code === p.from)!;
  const to = net.nodes.find((n) => n.code === p.to)!;
  const between = (a: number | null, b: number | null) => (a !== null && b !== null ? a + share * (b - a) : null);
  const x = between(from.x, to.x);
  const y = between(from.y, to.y);
  const chainage = between(from.chainage, to.chainage);
  const added: PipeNodeInput = {
    code,
    kind: node.kind,
    groundLevel: null,
    x: x === null ? null : round2(x),
    y: y === null ? null : round2(y),
    chainage: chainage === null ? null : Math.round(chainage),
    lat: round7(point[1]),
    lon: round7(point[0]),
  };
  const head: PipeSegmentInput = { ...p, to: code, lengthM: lengthA, path: first.slice(1, -1) };
  const tail: PipeSegmentInput = { ...p, code: nextNetworkCode([...net.pipes.map((x) => x.code), ...net.nodes.map((n) => n.code), code], p.code), from: code, lengthM: round3(p.lengthM - lengthA), path: second.slice(1, -1) };
  const i = net.pipes.indexOf(p);
  return {
    network: { nodes: [...net.nodes, added], pipes: [...net.pipes.slice(0, i), head, tail, ...net.pipes.slice(i + 1)] },
    problem: null,
  };
}

/** How close, in metres, a drawn line's end must come to a node to start or end there. */
export const DRAW_SNAP_M = 15;

/**
 * A new pipe drawn on the map: it starts and ends at the nodes its ends come within 15 m of, else at new junctions
 * there, takes the next pipe code, its length on the ground and the size given.
 */
export function addPipe(net: EditableNetwork, drawn: PipeRoute, size: Pick<PipeSegmentInput, 'diameterMm' | 'material' | 'pipeClass'>): EditableNetwork {
  if (drawn.length < 2) return net;
  const nodes = [...net.nodes];
  const taken = () => [...nodes.map((n) => n.code), ...net.pipes.map((p) => p.code)];
  const endAt = (at: LonLat): { code: string; at: LonLat } => {
    let best: { n: PipeNodeInput & { lat: number; lon: number }; d: number } | null = null;
    for (const n of nodes) if (placed(n)) {
      const d = groundDistanceM([n.lon, n.lat], at);
      if (d <= DRAW_SNAP_M && (!best || d < best.d)) best = { n, d };
    }
    if (best) return { code: best.n.code, at: [best.n.lon, best.n.lat] };
    // A junction named like J-12 sets the pattern; one named by its chainage (1+200) does not.
    const sample = [...nodes].reverse().find((n) => n.kind === 'JUNCTION' && /^[A-Za-z]+[-_ ]?\d+$/.test(n.code))?.code ?? 'J-0';
    const code = nextNetworkCode(taken(), sample);
    nodes.push({ code, kind: 'JUNCTION', groundLevel: null, ...localOf({ nodes, pipes: net.pipes }, at), chainage: null, lat: round7(at[1]), lon: round7(at[0]) });
    return { code, at };
  };
  const start = endAt(drawn[0]);
  const end = endAt(drawn[drawn.length - 1]);
  if (start.code === end.code) return net;
  const route: PipeRoute = [start.at, ...drawn.slice(1, -1), end.at];
  const sample = net.pipes[net.pipes.length - 1]?.code ?? 'P-0';
  const pipe: PipeSegmentInput = {
    code: nextNetworkCode(taken(), sample),
    from: start.code,
    to: end.code,
    lengthM: round1(routeLengthM(route)),
    diameterMm: size.diameterMm,
    material: size.material,
    pipeClass: size.pipeClass,
    scope: 'PROPOSED',
    surface: null,
    crossing: null,
    path: drawn.slice(1, -1).map(([x, y]) => [round7(x), round7(y)] as LonLat),
  };
  return { nodes, pipes: [...net.pipes, pipe] };
}

/** What an edit changed against the saved network, for the editor's list: new, changed and moved, by code. */
export function networkChanges(saved: EditableNetwork, edited: EditableNetwork): { added: string[]; changed: string[] } {
  const key = (x: object) => JSON.stringify(x);
  const was = new Map<string, string>([...saved.nodes.map((n) => [`n:${n.code}`, key(n)] as const), ...saved.pipes.map((p) => [`p:${p.code}`, key(p)] as const)]);
  const added: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of [...edited.nodes.map((n) => [`n:${n.code}`, key(n)] as const), ...edited.pipes.map((p) => [`p:${p.code}`, key(p)] as const)]) {
    const o = was.get(k);
    if (o === undefined) added.push(k.slice(2));
    else if (o !== v) changed.push(k.slice(2));
  }
  return { added, changed };
}
