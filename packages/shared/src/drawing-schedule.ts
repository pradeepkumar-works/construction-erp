/**
 * The drawing schedule (ARCHITECTURE "Design and drawings"): the drawings a project needs, from whom and
 * by when, each matched to the register when it arrives. A drawing still awaited past its day holds up work: it goes on
 * the watch list, a reminder letter chases it and it can be recorded as a delay, which starts the notice clock. Also the
 * company's drawing numbers and the as-built check at handover. Everything here is pure.
 */
import { daysBetween } from './maintenance';
import { BUILDABLE_STATUSES, DOCUMENT_DISCIPLINE_LABELS, type DocumentDiscipline, type RevisionStatus } from './documents';

/** Who issues a drawing: the client's side (whose lateness is a hindrance) or our own design side. */
export const DRAWING_SOURCES = ['CLIENT', 'CONSULTANT', 'ARCHITECT', 'DESIGN_CONSULTANT', 'OWN'] as const;
export type DrawingSource = (typeof DRAWING_SOURCES)[number];
export const DRAWING_SOURCE_LABELS: Record<DrawingSource, string> = {
  CLIENT: 'Client',
  CONSULTANT: 'Client’s consultant',
  ARCHITECT: 'Architect',
  DESIGN_CONSULTANT: 'Our design consultant',
  OWN: 'Our design team',
};
/** The client's side: a drawing it is late with is the client's delay, chased by letter. */
export const isClientSide = (s: DrawingSource) => s === 'CLIENT' || s === 'CONSULTANT' || s === 'ARCHITECT';
/** A reminder goes by letter to anyone outside the company. */
export const remindsByLetter = (s: DrawingSource) => s !== 'OWN';

/** A drawing due within this many days and not yet good for construction is due soon. */
export const DRAWING_SOON_DAYS = 7;

export type DrawingNeedState = 'AWAITED' | 'RECEIVED' | 'GFC' | 'DROPPED';
export const DRAWING_NEED_STATE_LABELS: Record<DrawingNeedState, string> = {
  AWAITED: 'Awaited',
  RECEIVED: 'Received, not for construction',
  GFC: 'Good for construction',
  DROPPED: 'Not needed',
};

export interface DrawingNeedFacts {
  neededBy: string;
  dropped: boolean;
  /** The first revision's day, once the drawing is in the register */
  receivedOn: string | null;
  /** The first revision site may build from */
  gfcOn: string | null;
}

/** Where a scheduled drawing stands: awaited, in but not yet buildable, good for construction, or no longer needed. */
export function drawingNeedState(f: DrawingNeedFacts): DrawingNeedState {
  if (f.dropped) return 'DROPPED';
  if (f.gfcOn) return 'GFC';
  return f.receivedOn ? 'RECEIVED' : 'AWAITED';
}

/** Days a drawing is late: still not buildable past its day (counting to today), or how late it came; null when in time. */
export function drawingDaysLate(f: DrawingNeedFacts, today: string): number | null {
  const state = drawingNeedState(f);
  if (state === 'DROPPED') return null;
  const late = daysBetween(f.neededBy, state === 'GFC' ? f.gfcOn! : today);
  return late > 0 ? late : null;
}

/** Still holding up work: not buildable and past its day. */
export const drawingOverdue = (f: DrawingNeedFacts, today: string) => (drawingNeedState(f) === 'AWAITED' || drawingNeedState(f) === 'RECEIVED') && f.neededBy < today;

/** Needed within `DRAWING_SOON_DAYS` and not yet buildable. */
export function drawingDueSoon(f: DrawingNeedFacts, today: string): boolean {
  const s = drawingNeedState(f);
  if (s === 'GFC' || s === 'DROPPED' || f.neededBy < today) return false;
  return daysBetween(today, f.neededBy) <= DRAWING_SOON_DAYS;
}

/** The days a document's revisions give the schedule: the first one in, and the first site may build from. */
export function revisionDays(revisions: { issuedOn: string; status: RevisionStatus }[]): { receivedOn: string | null; gfcOn: string | null } {
  const sorted = [...revisions].sort((a, b) => a.issuedOn.localeCompare(b.issuedOn));
  return { receivedOn: sorted[0]?.issuedOn ?? null, gfcOn: sorted.find((r) => BUILDABLE_STATUSES.includes(r.status))?.issuedOn ?? null };
}

/** A discipline's letters in a drawing number. */
export const DISCIPLINE_CODES: Record<DocumentDiscipline, string> = {
  GENERAL: 'GEN',
  ARCHITECTURAL: 'ARC',
  STRUCTURAL: 'STR',
  ROAD: 'RD',
  WATER: 'WS',
  ELECTRICAL: 'ELE',
  MECHANICAL: 'MEC',
  PLUMBING: 'PLB',
};

/** A drawing number's letters and digits only, for matching "STR-GA-101", "str ga 101" and "STR/GA/101" as one. */
export const drawingNoKey = (no: string) => no.toUpperCase().replace(/[^A-Z0-9]+/g, '');

/** The next number in the company's scheme, project, discipline, serial: "HSP-STR-007" after HSP-STR-006. */
export function nextDrawingNo(projectCode: string, discipline: DocumentDiscipline, existing: string[]): string {
  const prefix = `${projectCode.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${DISCIPLINE_CODES[discipline]}-`;
  const key = drawingNoKey(prefix);
  let max = 0;
  for (const no of existing) {
    const k = drawingNoKey(no);
    if (!k.startsWith(key)) continue;
    const serial = k.slice(key.length);
    if (/^\d+$/.test(serial)) max = Math.max(max, parseInt(serial, 10));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** What a schedule line needs before it is saved, in words for the form. */
export function drawingNeedProblem(l: { title: string; neededBy: string; source: DrawingSource; fromParty?: string | null }): string | null {
  if (!l.title.trim()) return 'Say which drawing it is';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.neededBy)) return 'Pick the day site needs it';
  if (remindsByLetter(l.source) && !l.fromParty?.trim()) return 'Say who issues it, such as the architect or the Executive Engineer';
  return null;
}

export interface ReminderLine {
  docNo: string | null;
  title: string;
  discipline: DocumentDiscipline;
  neededBy: string;
  reminders: number;
}

/** A reminder letter's subject and text for the drawings one party owes on a project, latest due first by day. */
export function reminderLetter(projectName: string, lines: ReminderLine[], today: string, formatDay: (d: string) => string): { subject: string; body: string } {
  const sorted = [...lines].sort((a, b) => a.neededBy.localeCompare(b.neededBy));
  const again = sorted.some((l) => l.reminders > 0);
  const one = sorted.length === 1;
  const subject = `${projectName}: ${one ? `drawing ${sorted[0].docNo ?? sorted[0].title}` : `${sorted.length} drawings`} awaited${again ? ', reminder' : ''}`;
  const rows = sorted.map((l, i) => {
    const late = daysBetween(l.neededBy, today);
    return `${i + 1}. ${[l.docNo, l.title].filter(Boolean).join(', ')} (${DOCUMENT_DISCIPLINE_LABELS[l.discipline]}): needed by ${formatDay(l.neededBy)}${late > 0 ? `, ${late} day${late === 1 ? '' : 's'} ago` : ''}.`;
  });
  const body = [
    `${again ? 'Further to our earlier letters, the' : 'The'} following ${one ? 'drawing is' : 'drawings are'} still awaited for the work at site:`,
    '',
    ...rows,
    '',
    `Work that depends on ${one ? 'it' : 'them'} cannot go ahead until ${one ? 'it is' : 'they are'} issued good for construction. Please issue ${one ? 'it' : 'them'} at the earliest. The time lost is being recorded as a hindrance, and we reserve our right to an extension of time for it under the contract.`,
  ].join('\n');
  return { subject, body };
}

/** Counts for the schedule's header: lines in each state, those holding up work and those due soon. */
export function scheduleCounts(lines: DrawingNeedFacts[], today: string) {
  const live = lines.filter((l) => !l.dropped);
  return {
    total: live.length,
    gfc: live.filter((l) => drawingNeedState(l) === 'GFC').length,
    overdue: live.filter((l) => drawingOverdue(l, today)).length,
    dueSoon: live.filter((l) => drawingDueSoon(l, today)).length,
  };
}

export interface DrawingNeedDto {
  id: string;
  projectId: string;
  projectName: string;
  docNo: string | null;
  title: string;
  discipline: DocumentDiscipline;
  source: DrawingSource;
  fromParty: string | null;
  neededBy: string;
  /** What it holds up */
  activityId: string | null;
  activityName: string | null;
  remarks: string | null;
  dropped: boolean;
  documentId: string | null;
  /** The register's current revision, once the drawing is in */
  revision: string | null;
  revisionStatus: RevisionStatus | null;
  receivedOn: string | null;
  gfcOn: string | null;
  state: DrawingNeedState;
  daysLate: number | null;
  overdue: boolean;
  dueSoon: boolean;
  riskId: string | null;
  riskNo: string | null;
  lastLetterId: string | null;
  lastLetterNo: string | null;
  lastReminderOn: string | null;
  reminders: number;
}

export interface DrawingScheduleDto {
  items: DrawingNeedDto[];
  total: number;
  counts: ReturnType<typeof scheduleCounts>;
}

/** A drawing site builds from that has no as-built revision yet, for the handover. */
export interface AsBuiltDueDto {
  documentId: string;
  projectId: string;
  projectName: string;
  docNo: string;
  title: string;
  discipline: DocumentDiscipline;
  revision: string;
  status: RevisionStatus;
  issuedOn: string;
}
