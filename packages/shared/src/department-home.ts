/**
 * Department screens (item 168, ARCHITECTURE "Department screens"): a department module's screen opens with a strip of
 * figures and the work in flight through it, as the client's screens asked. The figures are the area modules' own
 * (`ModuleHomeService`), picked per department here; the pipelines are read from the modules' own services (requests,
 * requests to order, procurement status, letters) and put in stage order by `pipelineStages` / `byPipelineUrgency`.
 */
import type { ModuleFigureDto, ModuleKey } from './modules';

/** Which area modules' figures a department shows, and which of them (all when `keys` is left out). */
export interface DepartmentFigureSource {
  module: ModuleKey;
  keys?: string[];
}

/**
 * The figures strip per department. Project management has none of its own here: its screen already shows the Projects
 * figures with the progress by project. A department with no figures yet shows its pages only.
 */
export const DEPARTMENT_FIGURES: Record<string, DepartmentFigureSource[]> = {
  'project-management': [],
  'quality-control': [{ module: 'quality' }, { module: 'safety' }],
  'design-drawings': [{ module: 'documents' }],
  correspondence: [{ module: 'correspondence' }],
  'planning-estimation': [{ module: 'site', keys: ['openRisks'] }],
  'purchase-management': [{ module: 'materials', keys: ['openRequests'] }, { module: 'purchases' }],
  'store-inventory': [{ module: 'materials' }, { module: 'purchases', keys: ['ordersLate'] }],
  'contractor-management': [],
  'machinery-vehicles': [{ module: 'plant' }],
  'plant-production': [{ module: 'rmc' }],
  'accounts-finance': [{ module: 'accounts' }, { module: 'billing', keys: ['receivable', 'notSent'] }],
  'labour-management': [{ module: 'site', keys: ['labourToday', 'dprToday'] }],
  'hr-payroll': [{ module: 'people' }],
  'reports-mis': [],
  administration: [],
};

/** At most this many figures in the strip, in the order of `DEPARTMENT_FIGURES`. */
export const DEPARTMENT_FIGURE_MAX = 6;

/** The strip from the modules' figures (by module), each source's keys in its own order. */
export function departmentFigures(department: string, byModule: Partial<Record<ModuleKey, ModuleFigureDto[]>>): ModuleFigureDto[] {
  const out: ModuleFigureDto[] = [];
  for (const src of DEPARTMENT_FIGURES[department] ?? []) {
    const figures = byModule[src.module] ?? [];
    const picked = src.keys ? src.keys.flatMap((k) => figures.filter((f) => f.key === k)) : figures;
    for (const f of picked) if (!out.some((o) => o.key === f.key)) out.push(f);
  }
  return out.slice(0, DEPARTMENT_FIGURE_MAX);
}

export const PIPELINE_KEYS = ['indents', 'deliveries', 'letters'] as const;
export type PipelineKey = (typeof PIPELINE_KEYS)[number];

/** The pipelines per department, top first. */
export const DEPARTMENT_PIPELINES: Record<string, PipelineKey[]> = {
  'purchase-management': ['indents'],
  'store-inventory': ['deliveries'],
  correspondence: ['letters'],
};

/** Every stage a pipeline's entries stand at, in the order the work moves. */
export const PIPELINE_STAGES: Record<PipelineKey, { key: string; label: string }[]> = {
  indents: [
    { key: 'APPROVAL', label: 'Waiting for approval' },
    { key: 'TO_ENQUIRE', label: 'No quotations yet' },
    { key: 'AWAITING_QUOTES', label: 'Waiting for quotations' },
    { key: 'TO_FINALISE', label: 'L1 to finalise' },
    { key: 'READY', label: 'PO to raise' },
    { key: 'NOT_STARTED', label: 'Ordered, to receive' },
    { key: 'PARTLY_RECEIVED', label: 'Part received' },
  ],
  deliveries: [
    { key: 'NOT_STARTED', label: 'Ordered, to receive' },
    { key: 'PARTLY_RECEIVED', label: 'Part received' },
  ],
  letters: [
    { key: 'SIGN', label: 'Waiting for the signature' },
    { key: 'SEAL', label: 'Waiting for the seal' },
    { key: 'REPLY', label: 'Our reply due' },
  ],
};

export const PIPELINE_TITLES: Record<PipelineKey, { title: string; note: string; href: string }> = {
  indents: { title: 'Indents in flight', note: 'Each material request from approval through quotations and the order to the last delivery.', href: '/material-requests' },
  deliveries: { title: 'Deliveries to receive', note: 'Approved orders with material still to come, late ones first.', href: '/purchase-orders?tab=status' },
  letters: { title: 'Letters in flight', note: 'Outward letters waiting to be signed or sealed, and letters waiting for our reply.', href: '/correspondence' },
};

/** At most this many rows of a pipeline on the screen; the stage counts cover them all. */
export const PIPELINE_ROW_MAX = 8;

export interface PipelineRowDto {
  id: string;
  /** The request, order or letter number */
  number: string;
  /** Where the row opens */
  href: string;
  projectName: string | null;
  /** What it is: the items, the vendor, the subject */
  title: string;
  stage: string;
  /** The day it is due or needed by, if it has one */
  dueOn: string | null;
  /** Days past `dueOn`; 0 when not late */
  daysLate: number;
  /** The day it reached its stage, for how long it has waited */
  since: string | null;
}

export interface PipelineStageCountDto {
  key: string;
  label: string;
  count: number;
}

export interface DepartmentPipelineDto {
  key: PipelineKey;
  title: string;
  note: string;
  /** Where the whole list is */
  href: string;
  stages: PipelineStageCountDto[];
  /** The most urgent first, at most `PIPELINE_ROW_MAX` */
  rows: PipelineRowDto[];
  total: number;
}

/** GET /dashboard/departments/:key */
export interface DepartmentHomeDto {
  department: string;
  date: string;
  figures: ModuleFigureDto[];
  pipelines: DepartmentPipelineDto[];
}

/** How many rows stand at each of the pipeline's stages, every stage listed (a stage with none shows 0). */
export function pipelineStages(key: PipelineKey, rows: { stage: string }[]): PipelineStageCountDto[] {
  return PIPELINE_STAGES[key].map((s) => ({ ...s, count: rows.filter((r) => r.stage === s.key).length }));
}

/** Late ones first (the latest most), then the soonest due, then the longest waiting. */
export function byPipelineUrgency(a: PipelineRowDto, b: PipelineRowDto): number {
  return b.daysLate - a.daysLate || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || (a.since ?? '9999').localeCompare(b.since ?? '9999') || a.number.localeCompare(b.number);
}

/** A pipeline from its rows: the stage counts over all of them, the most urgent few to show. */
export function pipelineOf(key: PipelineKey, rows: PipelineRowDto[]): DepartmentPipelineDto {
  const t = PIPELINE_TITLES[key];
  return { key, ...t, stages: pipelineStages(key, rows), rows: [...rows].sort(byPipelineUrgency).slice(0, PIPELINE_ROW_MAX), total: rows.length };
}

/** Days a date (YYYY-MM-DD) is past, as of today; 0 when not past or none. */
export function daysPast(due: string | null, today: string): number {
  if (!due || due >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}
