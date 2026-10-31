/*
 * The hero's drawing, worked out rather than drawn: a highway alignment set out the way a surveyor sets one out (straights,
 * spiral transitions and circular arcs, chainage every 50 m), over contours traced from a made-up terrain by marching squares.
 * Everything here is pure and deterministic, so the server and the browser draw the same lines.
 */

export type Pt = [number, number];

/** A point on the centre line: where it is, which way it heads (radians, screen axes) and how far along it is (px). */
export interface Station {
  x: number;
  y: number;
  h: number;
  s: number;
}

/** A stretch of road: its length and its curvature at each end (1 / radius, + turns right on screen). Equal ends are a
 * straight or an arc; unequal ends are a spiral (clothoid), whose curvature grows evenly with length. */
interface Leg {
  len: number;
  k0: number;
  k1: number;
}

/** Walks the legs from a start, a pixel at a time, turning by the curvature at each step. */
function walk(x: number, y: number, h: number, legs: Leg[]): Station[] {
  const out: Station[] = [{ x, y, h, s: 0 }];
  let s = 0;
  for (const leg of legs) {
    const n = Math.max(1, Math.round(leg.len));
    const ds = leg.len / n;
    for (let i = 0; i < n; i++) {
      const k = leg.k0 + ((leg.k1 - leg.k0) * (i + 0.5)) / n;
      const mid = h + (k * ds) / 2;
      x += Math.cos(mid) * ds;
      y += Math.sin(mid) * ds;
      h += k * ds;
      s += ds;
      out.push({ x, y, h, s });
    }
  }
  return out;
}

/** A curve of deflection `turn` (radians, + right): spiral in, arc, spiral out. */
function curve(turn: number, radius: number, spiral: number): Leg[] {
  const k = Math.sign(turn) / radius;
  const arc = Math.abs(turn) * radius - spiral;
  return [
    { len: spiral, k0: 0, k1: k },
    { len: arc, k0: k, k1: k },
    { len: spiral, k0: k, k1: 0 },
  ];
}

const end = (legs: Leg[]) => walk(0, 0, 0, legs).at(-1)!;

/** Metres on the ground for each pixel of the drawing. */
export const METRES_PER_PX = 2;

export interface Alignment {
  line: Station[];
  /** Where each curve is laid out from: the tangents' meeting point (PI), the curve's start (TS) and end (ST). */
  curves: { pi: Pt; ts: Pt; st: Pt; turn: number; radius: number; spiral: number }[];
  /** Chainage of the first point, in metres. */
  startCh: number;
}

/**
 * The hero's road, in px about the centre of the hero's content: east along the bottom, a left-hand curve into the gap between
 * the words and Ask, north up the gap, a right-hand curve and east along the top. `bottom` and `top` are the two straights' y.
 */
export function heroAlignment(bottom = 340, top = -325, from = -1000, to = 1000, radius = 110, spiral = 40): Alignment {
  const left = curve(-Math.PI / 2, radius, spiral);
  const right = curve(Math.PI / 2, radius, spiral);
  const a = end(left); // eastward then north: a.x along, a.y up (negative)
  const b = walk(0, 0, -Math.PI / 2, right).at(-1)!;
  const lead = 0 - from - a.x;
  const rise = bottom + a.y - top + b.y; // a.y and b.y are negative: what each curve climbs
  const tail = to - b.x;
  const legs: Leg[] = [
    { len: lead, k0: 0, k1: 0 },
    ...left,
    { len: rise, k0: 0, k1: 0 },
    ...right,
    { len: tail, k0: 0, k1: 0 },
  ];
  const line = walk(from, bottom, 0, legs);
  const at = (s: number) => line[Math.min(line.length - 1, Math.round(s))];
  const c1 = at(lead);
  const c1end = at(lead + (Math.PI / 2) * radius + spiral);
  const c2 = at(c1end.s + rise);
  const c2end = at(c2.s + (Math.PI / 2) * radius + spiral);
  return {
    line,
    curves: [
      { pi: [0, bottom], ts: [c1.x, c1.y], st: [c1end.x, c1end.y], turn: -Math.PI / 2, radius, spiral },
      { pi: [0, top], ts: [c2.x, c2.y], st: [c2end.x, c2end.y], turn: Math.PI / 2, radius, spiral },
    ],
    // So that 14+200 falls 440 px along, under the words.
    startCh: 14200 - 440 * METRES_PER_PX,
  };
}

/** The narrow screens' road, in a 720 × 140 strip: a straight, one gentle curve to the right, a straight. */
export function stripAlignment(): Alignment {
  const legs: Leg[] = [{ len: 200, k0: 0, k1: 0 }, ...curve(0.42, 260, 60), { len: 400, k0: 0, k1: 0 }];
  const line = walk(-40, 96, -0.2, legs);
  return { line, curves: [], startCh: 14200 - 70 * METRES_PER_PX };
}

const fmt = (n: number) => n.toFixed(1);

/** The centre line, or a line offset from it to one side (+ to the right of travel), as an SVG path. */
export function linePath(line: Station[], offset = 0, from = 0, to = Infinity, step = 4): string {
  const pts = line.filter((p, i) => p.s >= from && p.s <= to && (i % step === 0 || i === line.length - 1));
  return pts
    .map((p, i) => {
      const x = p.x - Math.sin(p.h) * offset;
      const y = p.y + Math.cos(p.h) * offset;
      return `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
    })
    .join('');
}

/** Chainage in the Indian highway form: 14+200. */
export const chainage = (m: number) => `${Math.floor(m / 1000)}+${String(Math.round(m % 1000)).padStart(3, '0')}`;

/** A tick across the road every 50 m, a longer one every 200 m with its chainage. */
export function ticks(a: Alignment, halfWidth: number): { d: string; labels: { x: number; y: number; h: number; text: string }[] } {
  let d = '';
  const labels: { x: number; y: number; h: number; text: string }[] = [];
  const first = Math.ceil(a.startCh / 50) * 50;
  for (let m = first; ; m += 50) {
    const s = (m - a.startCh) / METRES_PER_PX;
    const p = a.line[Math.round(s)];
    if (!p) break;
    const major = m % 200 === 0;
    const len = halfWidth + (major ? 7 : 3);
    const nx = -Math.sin(p.h);
    const ny = Math.cos(p.h);
    d += `M${fmt(p.x + nx * halfWidth)} ${fmt(p.y + ny * halfWidth)}L${fmt(p.x + nx * len)} ${fmt(p.y + ny * len)}`;
    if (major) labels.push({ x: p.x + nx * (len + 6), y: p.y + ny * (len + 6), h: p.h, text: chainage(m) });
  }
  return { d, labels };
}

/** Where a chainage falls on the line. */
export function stationAt(a: Alignment, m: number): Station {
  return a.line[Math.max(0, Math.min(a.line.length - 1, Math.round((m - a.startCh) / METRES_PER_PX)))];
}

/* Terrain: a few hills and a valley over a slow fall to the east, traced at even heights. */
const HILLS: [number, number, number, number][] = [
  [380, 260, 34, 210],
  [1500, 760, 30, 260],
  [1120, 180, 18, 150],
  [260, 820, -22, 230],
  [820, 560, 12, 120],
  [1760, 220, 16, 180],
];

function height(x: number, y: number): number {
  let z = 40 - x * 0.006 + Math.sin(x / 210) * 2.2 + Math.cos(y / 170) * 1.6;
  for (const [hx, hy, a, r] of HILLS) z += a * Math.exp(-((x - hx) ** 2 + (y - hy) ** 2) / (2 * r * r));
  return z;
}

/**
 * Contours of the terrain over a `w` × `h` sheet, every `interval` metres, by marching squares on a `cell` px grid, joined into
 * lines. `index` marks every fifth contour, which a survey drawing draws heavier.
 */
export function contours(w: number, h: number, interval = 3, cell = 16): { d: string; index: boolean; level: number }[] {
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const z: number[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = height(i * cell, j * cell);
      z.push(v);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const out: { d: string; index: boolean; level: number }[] = [];
  for (let level = Math.ceil(lo / interval) * interval; level <= hi; level += interval) {
    const segs: [Pt, Pt][] = [];
    const cross = (i0: number, j0: number, i1: number, j1: number): Pt => {
      const a = z[j0 * cols + i0];
      const b = z[j1 * cols + i1];
      const t = (level - a) / (b - a);
      return [(i0 + (i1 - i0) * t) * cell, (j0 + (j1 - j0) * t) * cell];
    };
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const tl = z[j * cols + i] > level ? 8 : 0;
        const tr = z[j * cols + i + 1] > level ? 4 : 0;
        const br = z[(j + 1) * cols + i + 1] > level ? 2 : 0;
        const bl = z[(j + 1) * cols + i] > level ? 1 : 0;
        const c = tl | tr | br | bl;
        if (c === 0 || c === 15) continue;
        const top = () => cross(i, j, i + 1, j);
        const right = () => cross(i + 1, j, i + 1, j + 1);
        const bottom = () => cross(i, j + 1, i + 1, j + 1);
        const left = () => cross(i, j, i, j + 1);
        const pairs: Record<number, (() => Pt)[][]> = {
          1: [[left, bottom]],
          2: [[bottom, right]],
          3: [[left, right]],
          4: [[top, right]],
          5: [
            [left, top],
            [bottom, right],
          ],
          6: [[top, bottom]],
          7: [[left, top]],
          8: [[left, top]],
          9: [[top, bottom]],
          10: [
            [left, bottom],
            [top, right],
          ],
          11: [[top, right]],
          12: [[left, right]],
          13: [[bottom, right]],
          14: [[left, bottom]],
        };
        for (const [p, q] of pairs[c]) segs.push([p(), q()]);
      }
    out.push({ d: joinSegments(segs), index: Math.round(level / interval) % 5 === 0, level });
  }
  return out;
}

/** Joins segments that share ends into polylines, so a contour is one smooth stroke rather than hundreds of dashes. */
function joinSegments(segs: [Pt, Pt][]): string {
  const key = (p: Pt) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
  const ends = new Map<string, number[]>();
  segs.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const next = (p: Pt): [number, Pt] | null => {
    for (const i of ends.get(key(p)) ?? []) {
      if (used[i]) continue;
      const [a, b] = segs[i];
      return [i, key(a) === key(p) ? b : a];
    }
    return null;
  };
  let d = '';
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const line: Pt[] = [segs[i][0], segs[i][1]];
    for (let n = next(line[line.length - 1]); n; n = next(line[line.length - 1])) {
      used[n[0]] = true;
      line.push(n[1]);
    }
    for (let n = next(line[0]); n; n = next(line[0])) {
      used[n[0]] = true;
      line.unshift(n[1]);
    }
    if (line.length < 4) continue;
    d += line.map((p, k) => `${k ? 'L' : 'M'}${Math.round(p[0])} ${Math.round(p[1])}`).join('');
  }
  return d;
}
