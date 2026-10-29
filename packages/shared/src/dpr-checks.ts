import type { RoleKey } from './enums';
import { canApprove } from './permissions';

/**
 * DPR credibility checks (intelligence quick win Q3): what an approver should look at twice before approving a daily
 * report. Each is advice and never stops an approval. The rules are pure in `apps/api/src/dpr/dpr-check-rules.ts`.
 */
export const DPR_CHECK_KINDS = ['NO_CREW', 'NO_MATERIAL', 'COPIED', 'CREW_COPIED', 'PHOTO_REUSED'] as const;
export type DprCheckKind = (typeof DPR_CHECK_KINDS)[number];

export const DPR_CHECK_LABELS: Record<DprCheckKind, string> = {
  NO_CREW: 'No crew',
  NO_MATERIAL: 'No material issued',
  COPIED: 'Same figure as before',
  CREW_COPIED: 'Same crew as before',
  PHOTO_REUSED: 'Photo used before',
};

/** Reports in a row with the same quantity on an activity before it reads as copied. */
export const DPR_COPY_DAYS = 3;
/** Reports in a row with the very same crew, category by category, before it reads as copied. */
export const DPR_CREW_COPY_DAYS = 5;
/** Days up to the report in which the material a line's norms need should have been issued. */
export const DPR_ISSUE_DAYS = 7;
/** Days back a photo is compared over. */
export const DPR_PHOTO_DAYS = 90;
/** Smaller files (icons, thumbnails) are left out of the photo comparison. */
export const DPR_PHOTO_MIN_BYTES = 20_000;

/** Who sees the checks: those who approve daily reports. */
export const canSeeDprChecks = (role: RoleKey) => canApprove(role);

export interface DprCheckDto {
  kind: DprCheckKind;
  /** The work line it is about, else null for the whole report */
  lineId: string | null;
  /** What was found, in a sentence */
  text: string;
  /** The earlier report or reports it was compared with */
  refs: { label: string; href: string }[];
}

export interface DprChecksDto {
  dprId: string;
  checks: DprCheckDto[];
}
