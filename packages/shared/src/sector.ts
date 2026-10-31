/** Sector progress views: road chainage strip, building floor matrix, water supply villages and pipeline stages. */
import type { ProjectType, WorkLocation } from './enums';

/** Structured location on a progress entry or a measurement. Chainage is in metres from the project's 0+000. */
export interface SectorFields {
  chainageFrom: number | null;
  chainageTo: number | null;
  floor: string | null;
  village: string | null;
}

/** The longest road or pipeline the strip chart draws (1,000 km). */
export const MAX_CHAINAGE_M = 1_000_000;
export const MAX_SECTOR_NAMES = 200;

/** 12345 → "12+345". */
export const formatChainage = (m: number | null | undefined): string => {
  if (m === null || m === undefined || !Number.isFinite(m)) return '';
  const whole = Math.round(m);
  return `${Math.floor(whole / 1000)}+${String(whole % 1000).padStart(3, '0')}`;
};

/** "12+345", "12+345.0" or plain metres "12345" → 12345; anything else → null. */
export const parseChainage = (text: string | null | undefined): number | null => {
  const s = (text ?? '').trim().replace(/^(ch\.?|km)\s*/i, '');
  if (!s) return null;
  const km = /^(\d{1,4})\s*\+\s*(\d{1,3})(?:\.\d+)?$/.exec(s);
  if (km) return Number(km[1]) * 1000 + Number(km[2]);
  if (/^\d{1,7}$/.test(s)) return Number(s);
  return null;
};

/** A short description of the structured location, used as the entry's location when none is typed. */
export const sectorLocation = (f: Partial<SectorFields>): string | null => {
  const parts: string[] = [];
  if (f.village) parts.push(f.village);
  if (f.floor) parts.push(f.floor);
  if (f.chainageFrom !== null && f.chainageFrom !== undefined) {
    parts.push(f.chainageTo !== null && f.chainageTo !== undefined && f.chainageTo !== f.chainageFrom ? `Ch ${formatChainage(f.chainageFrom)} to ${formatChainage(f.chainageTo)}` : `Ch ${formatChainage(f.chainageFrom)}`);
  }
  return parts.length ? parts.join(', ') : null;
};

/** Where a project's work is located, by its built-in kind: what a project of no type of its own (Plant, Store, made before project types) asks for. */
export const LOCATIONS_OF_BASE: Record<ProjectType, WorkLocation[]> = {
  ROAD: ['CHAINAGE'],
  BUILDING: ['FLOOR'],
  WATER_SUPPLY: ['CHAINAGE', 'VILLAGE'],
  SEWERAGE: ['CHAINAGE'],
  OTHER: [],
  PLANT: [],
  STORE: [],
};

/**
 * Which structured location a project asks for on progress and measurements: its type's places (`locations`
 * on the project from the API), else its built-in kind's.
 */
export const sectorKinds = (p: ProjectType | { type: ProjectType; locations?: WorkLocation[] | null }): { chainage: boolean; floor: boolean; village: boolean } => {
  const places = typeof p === 'string' ? LOCATIONS_OF_BASE[p] : (p.locations ?? LOCATIONS_OF_BASE[p.type]);
  return { chainage: places.includes('CHAINAGE'), floor: places.includes('FLOOR'), village: places.includes('VILLAGE') };
};

/** Floors a new building project starts with on its sector settings. */
export const DEFAULT_FLOORS = ['Foundation', 'Plinth', 'Ground floor', 'First floor', 'Second floor', 'Terrace'];

const LENGTH_UNITS = new Set(['m', 'mtr', 'mtrs', 'metre', 'metres', 'meter', 'meters', 'rm', 'rmt', 'rmtr', 'r.m', 'r.m.', 'rmt.', 'lm', 'running metre', 'running meter']);
/** A unit measured in metres of length (pipes laid, kerbs, drains). */
export const isLengthUnit = (unit: string) => LENGTH_UNITS.has(unit.trim().toLowerCase());
/** A purchased item that counts as pipe for the pipeline stages: bought in metres and named as a pipe or a pipe material. */
export const isPipeItem = (name: string, unit: string) => isLengthUnit(unit) && /pipe|hdpe|mdpe|u?pvc|ductile|\b(di|ci|gi|ms)\b|\bpe ?(80|100)\b/i.test(name);

/** Water supply: an activity measured in metres counts as pipe laid, or as pipe tested when its name says test. */
export const pipelineStageOf = (a: { name: string; unit: string }): 'LAID' | 'TESTED' | null => (isLengthUnit(a.unit) ? (/test/i.test(a.name) ? 'TESTED' : 'LAID') : null);

export interface ChainageSegment {
  from: number;
  to: number;
  quantity: string;
  status: 'APPROVED' | 'SUBMITTED';
  date: string;
  entryId: string;
}

/** One layer (activity) of the road strip chart. */
export interface ChainageLayer {
  activityId: string;
  name: string;
  unit: string;
  plannedQty: string;
  executedQty: string;
  /** Length covered by approved entries, overlaps counted once, inside the project's range */
  coveredM: number;
  /** Length covered only by entries waiting for approval */
  pendingM: number;
  /** Approved quantity on entries with no chainage */
  unplacedQty: string;
  segments: ChainageSegment[];
}

export interface SectorCell {
  /** Floor or village */
  row: string;
  activityId: string;
  approvedQty: string;
  pendingQty: string;
  lastDate: string | null;
}

/** Floors (building) or villages (water supply) by activity. */
export interface SectorMatrix {
  rowLabel: 'Floor' | 'Village';
  /** The project's list, then any other names entries used */
  rows: string[];
  activities: { id: string; name: string; unit: string; plannedQty: string; executedQty: string }[];
  cells: SectorCell[];
  /** Approved quantity per activity on entries with no floor / village */
  unassigned: { activityId: string; approvedQty: string }[];
}

/** Water supply pipe, in metres: bought, delivered, laid and tested. */
export interface PipelineStages {
  /** Pipe on approved purchase orders for the project (items named pipe, in metres) */
  orderedM: string;
  /** Pipe received into the project's store */
  suppliedM: string;
  laidM: string;
  testedM: string;
  /** Planned length of the laying activities */
  plannedM: string;
}

export interface VillagePipeline {
  village: string;
  laidM: string;
  testedM: string;
}

export interface SectorProgressDto {
  projectId: string;
  type: ProjectType;
  chainageStart: number | null;
  chainageEnd: number | null;
  floors: string[];
  villages: string[];
  /** Road, and water supply with a chainage range: one row per activity measured along the length */
  strip: ChainageLayer[] | null;
  /** Building floors, or water supply villages */
  matrix: SectorMatrix | null;
  /** Water supply only */
  pipeline: { stages: PipelineStages; villages: VillagePipeline[] } | null;
}

/** Total length of a set of intervals with overlaps counted once, clipped to [min, max] when given. */
export const coveredLength = (segments: { from: number; to: number }[], min?: number | null, max?: number | null): number => {
  const xs = segments
    .map((s) => [Math.min(s.from, s.to), Math.max(s.from, s.to)] as [number, number])
    .map(([a, b]) => [min !== null && min !== undefined ? Math.max(a, min) : a, max !== null && max !== undefined ? Math.min(b, max) : b] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const x of xs) {
    if (cur && x[0] <= cur[1]) cur[1] = Math.max(cur[1], x[1]);
    else {
      if (cur) total += cur[1] - cur[0];
      cur = [x[0], x[1]];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return total;
};
