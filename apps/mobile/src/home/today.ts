import { kvGet } from '../utils/kv';

/**
 * Today on site (My work): how far a DPR typed on this phone has got. The DPR form keeps its unsent work as a draft on
 * the phone (`useFormDraft`, key "dpr"); this reads that draft, never the form, so the steps show without opening it.
 */
export interface DprDraftSteps {
  projectId: string;
  date: string;
  /** People counted in the head count */
  headCount: number;
  /** Work lines with an activity */
  lines: number;
  /** Photos on the report and its lines */
  photos: number;
}

interface DraftShape {
  projectId?: string | null;
  date?: string;
  manpower?: { category?: string | null; count?: string }[];
  lines?: { activityId?: string | null; photos?: unknown[] }[];
  photos?: unknown[];
}

/** The steps of a DPR draft, from what the form saved; null for a draft with no project or date. */
export function dprDraftSteps(value: DraftShape): DprDraftSteps | null {
  if (!value.projectId || !value.date) return null;
  const lines = (value.lines ?? []).filter((l) => l.activityId);
  return {
    projectId: value.projectId,
    date: value.date,
    headCount: (value.manpower ?? []).filter((r) => r.category && /^\d+$/.test((r.count ?? '').trim())).reduce((n, r) => n + Number(r.count), 0),
    lines: lines.length,
    photos: (value.photos ?? []).length + lines.reduce((n, l) => n + (l.photos ?? []).length, 0),
  };
}

/** The DPR draft this user keeps on this phone, if any. */
export function readDprDraft(userId: string): DprDraftSteps | null {
  const raw = kvGet(`nirmaan.draft.${userId}.dpr`);
  if (!raw) return null;
  try {
    return dprDraftSteps((JSON.parse(raw) as { value: DraftShape }).value ?? {});
  } catch {
    return null;
  }
}
