/**
 * Site photo checks: a short caption for each photo on a DPR, a progress entry, a safety incident or a
 * snag, and flags such as workers without helmets or a photo that shows other work than the entry says. Advisory only:
 * a flag never blocks a submission, and a project's safety officer can switch the flags off.
 */

export const PHOTO_CHECK_KINDS = ['dpr', 'progress', 'incident', 'defect'] as const;
export type PhotoCheckKind = (typeof PHOTO_CHECK_KINDS)[number];

export const PHOTO_FLAGS = ['NO_HELMET', 'NO_HARNESS', 'NO_BARRICADE', 'UNSAFE_SCAFFOLD', 'OTHER_WORK', 'UNCLEAR', 'NOT_SITE'] as const;
export type PhotoFlag = (typeof PHOTO_FLAGS)[number];

/** What each flag says on the record, and whether it is a safety flag. */
export const PHOTO_FLAG_INFO: Record<PhotoFlag, { label: string; safety: boolean }> = {
  NO_HELMET: { label: 'Workers without helmets', safety: true },
  NO_HARNESS: { label: 'Work at height without a harness', safety: true },
  NO_BARRICADE: { label: 'Open edge or trench without a barricade', safety: true },
  UNSAFE_SCAFFOLD: { label: 'Scaffold looks unsafe', safety: true },
  OTHER_WORK: { label: 'Photo shows other work than the entry', safety: false },
  UNCLEAR: { label: 'Too dark or blurred to judge', safety: false },
  NOT_SITE: { label: 'Does not look like a site photo', safety: false },
};

/** A flag is shown only when the model is at least this sure of it (0 to 1). */
export const PHOTO_FLAG_MIN_CONFIDENCE = 0.75;
/** Photos larger than this are not sent to the model (bytes); the phone app sends them smaller. */
export const PHOTO_CHECK_MAX_BYTES = 3_700_000;
/** Photos checked per request; the page asks again for the rest. */
export const PHOTO_CHECKS_PER_RUN = 4;

export interface PhotoCheckFlagDto {
  key: PhotoFlag;
  label: string;
  /** What the model saw, in a line ("photo shows plastering; the entry says brickwork") */
  detail: string | null;
  confidence: number;
}

export interface PhotoCheckDto {
  attachmentId: string;
  fileName: string;
  /** DONE: read; SKIPPED: not sent (format or size, see reason); FAILED: the model could not be reached or answered badly */
  status: 'DONE' | 'SKIPPED' | 'FAILED';
  caption: string | null;
  /** Flags above the confidence bar; empty when the project's flags are off */
  flags: PhotoCheckFlagDto[];
  reason: string | null;
}

export interface PhotoChecksDto {
  kind: PhotoCheckKind;
  recordId: string;
  projectId: string;
  /** Ask Nirmaan is on for this user and company */
  available: boolean;
  /** The project's safety officer switched the flags off (captions still show) */
  flagsOff: boolean;
  /** This user may switch the project's flags on or off */
  canSwitch: boolean;
  checks: PhotoCheckDto[];
  /** Photos not checked yet; POST …/run checks the next few */
  pending: number;
}

/** A snag's title, description and place, drafted from its photo for the form; nothing is saved until the user saves. */
export interface SnagDraftDto {
  title: string;
  description: string;
  location: string | null;
  trade: string | null;
  caption: string | null;
  /** Anything else the model flagged in the photo, above the bar (none when the project's flags are off) */
  flags: PhotoCheckFlagDto[];
}
