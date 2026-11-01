/**
 * Measuring on drawings: lengths, areas and counts taken off a revision's sheet in the drawing viewer, and
 * the scale that turns the sheet's own coordinates into metres. Points are the markup's: x and y from 0 to 1 of the
 * page's width and height (y down). A page's `aspect` is its width over its height, so a point is (x × aspect, y) in
 * units of the page's height, and the scale is metres per page height.
 */
import type { MarkupPoint } from './markup';

export const TAKEOFF_KINDS = ['LENGTH', 'AREA', 'COUNT'] as const;
export type TakeoffKind = (typeof TAKEOFF_KINDS)[number];

export const TAKEOFF_KIND_LABELS: Record<TakeoffKind, string> = { LENGTH: 'Length', AREA: 'Area', COUNT: 'Count' };
/** The unit each kind is measured in. */
export const TAKEOFF_UNITS: Record<TakeoffKind, string> = { LENGTH: 'm', AREA: 'm²', COUNT: 'nos' };

/** Points a measure may have: a line of up to this many corners, an area's outline, or the things counted. */
export const TAKEOFF_MAX_POINTS = 500;
export const TAKEOFF_LABEL_MAX = 200;
/** A scale's known length: more than a millimetre, less than 100 km. */
export const SCALE_MIN_M = 0.001;
export const SCALE_MAX_M = 100_000;

const TAKEOFF_POINTS: Record<TakeoffKind, number> = { LENGTH: 2, AREA: 3, COUNT: 1 };

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** The distance between two points in page heights. */
export function pageDistance(a: MarkupPoint, b: MarkupPoint, aspect: number): number {
  return Math.hypot((b[0] - a[0]) * aspect, b[1] - a[1]);
}

/** Metres per page height from two points a known distance apart; null when the points coincide. */
export function scaleFrom(points: [MarkupPoint, MarkupPoint], lengthM: number, aspect: number): number | null {
  const d = pageDistance(points[0], points[1], aspect);
  return d > 1e-9 && lengthM > 0 ? lengthM / d : null;
}

/** The length of a line through the points, in page heights. */
export function polylineLength(points: MarkupPoint[], aspect: number): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += pageDistance(points[i - 1], points[i], aspect);
  return s;
}

/** The area inside the outline (closed back to its first point), in square page heights; self-crossing outlines net out. */
export function polygonArea(points: MarkupPoint[], aspect: number): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    s += x1 * aspect * y2 - x2 * aspect * y1;
  }
  return Math.abs(s) / 2;
}

/**
 * What a measure comes to, to 3 decimals: metres along a line, square metres inside an outline, or the number of points
 * counted. A length or area needs the sheet's scale (metres per page height); a count does not.
 */
export function takeoffValue(kind: TakeoffKind, points: MarkupPoint[], aspect: number, scale: number | null): number | null {
  if (kind === 'COUNT') return points.length;
  if (!scale) return null;
  return kind === 'LENGTH' ? round3(polylineLength(points, aspect) * scale) : round3(polygonArea(points, aspect) * scale * scale);
}

/** Why a measure cannot be saved, in words for the person measuring; null when it can. */
export function takeoffProblem(kind: TakeoffKind, points: unknown, label: string | null | undefined, hasScale: boolean): string | null {
  if (!Array.isArray(points) || points.length < TAKEOFF_POINTS[kind])
    return kind === 'LENGTH' ? 'Click at least two points along the line' : kind === 'AREA' ? 'Click at least three corners of the area' : 'Click each thing you count';
  if (points.length > TAKEOFF_MAX_POINTS) return `A measure can have up to ${TAKEOFF_MAX_POINTS} points; split it in two`;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'Measure again';
    if (p[0] < -0.05 || p[0] > 1.05 || p[1] < -0.05 || p[1] > 1.05) return 'Keep the measure on the drawing';
  }
  if (!label?.trim()) return 'Say what it is, e.g. "Plinth beam, grid A"';
  if (label.length > TAKEOFF_LABEL_MAX) return `Keep the name under ${TAKEOFF_LABEL_MAX} characters`;
  if (kind !== 'COUNT' && !hasScale) return 'Set the scale on this sheet first: click two points a known distance apart';
  return null;
}

/** Why a scale cannot be saved; null when it can. */
export function scaleProblem(points: unknown, lengthM: number, aspect: number): string | null {
  if (!Array.isArray(points) || points.length !== 2) return 'Click two points a known distance apart';
  for (const p of points) if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'Click the two points again';
  if (!(aspect > 0) || !Number.isFinite(aspect)) return 'Open the drawing again';
  if (!(lengthM >= SCALE_MIN_M && lengthM <= SCALE_MAX_M)) return 'Enter the real distance between the points in metres';
  if (pageDistance(points[0] as MarkupPoint, points[1] as MarkupPoint, aspect) < 0.002) return 'Click two points further apart, ideally a long dimension';
  return null;
}

/**
 * The scale of a DXF whose drawing units are known: the sheet is `widthUnits` across, so the points at either end of its
 * middle are that far apart. Units in mm, cm or m.
 */
export const DRAWING_UNIT_METRES = { mm: 0.001, cm: 0.01, m: 1 } as const;
export type DrawingUnit = keyof typeof DRAWING_UNIT_METRES;
export function dxfScalePoints(widthUnits: number, unit: DrawingUnit): { points: [MarkupPoint, MarkupPoint]; lengthM: number } {
  return { points: [[0, 0.5], [1, 0.5]], lengthM: round3(widthUnits * DRAWING_UNIT_METRES[unit]) };
}

/** A line for the measurement book: a length as its L, a rectangle as L × B, any other area as its area, a count as nos. */
export interface TakeoffLineValues {
  description: string;
  nos: number | null;
  length: number | null;
  breadth: number | null;
}

/** Whether four corners make a rectangle (right angles within half a degree), and its two sides in page heights. */
export function rectangleSides(points: MarkupPoint[], aspect: number): [number, number] | null {
  if (points.length !== 4) return null;
  const v = points.map((p, i) => {
    const q = points[(i + 1) % 4];
    return [(q[0] - p[0]) * aspect, q[1] - p[1]] as const;
  });
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = v[i];
    const [bx, by] = v[(i + 1) % 4];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return null;
    if (Math.abs((ax * bx + ay * by) / (la * lb)) > Math.sin((0.5 * Math.PI) / 180)) return null;
  }
  return [Math.hypot(...v[0]), Math.hypot(...v[1])];
}

export function takeoffLine(t: { kind: TakeoffKind; label: string; points: MarkupPoint[]; value: string | number }, aspect: number | null, scale: number | null): TakeoffLineValues {
  const value = Number(t.value);
  if (t.kind === 'COUNT') return { description: t.label, nos: value, length: null, breadth: null };
  if (t.kind === 'LENGTH') return { description: t.label, nos: 1, length: value, breadth: null };
  const sides = aspect && scale ? rectangleSides(t.points, aspect) : null;
  if (sides) {
    const [a, b] = sides.map((s) => round3(s * scale!)).sort((x, y) => y - x);
    return { description: t.label, nos: 1, length: a, breadth: b };
  }
  return { description: `${t.label} (area)`, nos: 1, length: value, breadth: null };
}

/** The sum of measures of one kind, to 3 decimals. */
export const takeoffTotal = (values: (string | number)[]) => round3(values.reduce<number>((s, v) => s + Number(v), 0));

/** Which quantity of a BOQ item the measures set: the tender's (original) or the revised one. */
export const TAKEOFF_BOQ_FIELDS = ['ORIGINAL', 'REVISED'] as const;
export type TakeoffBoqField = (typeof TAKEOFF_BOQ_FIELDS)[number];

/**
 * A BOQ quantity from measures: their total times a factor (a slab's thickness turns square metres into cubic metres),
 * to 3 decimals; or why it cannot be had. The measures must be of one kind, since metres and square metres do not add.
 */
export function takeoffBoqQty(measures: { kind: TakeoffKind; value: string | number }[], factor = 1): { qty: number } | { problem: string } {
  if (!measures.length) return { problem: 'Pick the measures to add up' };
  if (new Set(measures.map((m) => m.kind)).size > 1) return { problem: 'Pick measures of one kind: lengths, areas or counts do not add together' };
  if (!(factor > 0) || !Number.isFinite(factor)) return { problem: 'Multiply by a number above zero, or leave it at 1' };
  const qty = round3(takeoffTotal(measures.map((m) => m.value)) * factor);
  if (!(qty > 0)) return { problem: 'The measures add up to nothing' };
  return { qty };
}

export interface DrawingScaleDto {
  attachmentId: string;
  page: number;
  points: [MarkupPoint, MarkupPoint];
  /** The real distance between the points, in metres */
  lengthM: string;
  /** Metres per page height */
  metresPerPage: number;
  aspect: number;
  setByName: string;
  updatedAt: string;
}

export interface DrawingTakeoffDto {
  id: string;
  documentId: string;
  /** T1, T2… on the document */
  takeoffNo: number;
  revisionId: string;
  revision: string;
  attachmentId: string;
  page: number;
  kind: TakeoffKind;
  points: MarkupPoint[];
  label: string;
  /** In `TAKEOFF_UNITS[kind]`, to 3 decimals */
  value: string;
  /** The measurement sheet it went into, if any */
  measurementId: string | null;
  mbNo: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

export interface DrawingTakeoffsDto {
  /** The scale of each sheet (file and page) of the document that has one */
  scales: DrawingScaleDto[];
  takeoffs: DrawingTakeoffDto[];
}
