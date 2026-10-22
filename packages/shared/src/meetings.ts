/**
 * Meetings and action items (v6 item 112): a meeting on a project and its minutes (who came, what was noted and
 * decided), and the actions, each with an owner and a due date, that stay open and come up at the next meetings until
 * they are done or dropped.
 */
export const MEETING_KINDS = ['PROGRESS', 'CLIENT', 'SUBCONTRACTOR', 'DESIGN', 'SAFETY', 'QUALITY', 'OTHER'] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  PROGRESS: 'Progress review',
  CLIENT: 'With the client',
  SUBCONTRACTOR: 'With subcontractors',
  DESIGN: 'Design and drawings',
  SAFETY: 'Safety',
  QUALITY: 'Quality',
  OTHER: 'Other',
};

export const MEETING_STATUSES = ['DRAFT', 'ISSUED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = { DRAFT: 'Draft', ISSUED: 'Minutes issued' };

export const MEETING_POINT_KINDS = ['NOTE', 'DECISION'] as const;
export type MeetingPointKind = (typeof MEETING_POINT_KINDS)[number];
export const MEETING_POINT_KIND_LABELS: Record<MeetingPointKind, string> = { NOTE: 'Noted', DECISION: 'Decided' };

export const MEETING_ACTION_STATUSES = ['OPEN', 'DONE', 'DROPPED'] as const;
export type MeetingActionStatus = (typeof MEETING_ACTION_STATUSES)[number];
export const MEETING_ACTION_STATUS_LABELS: Record<MeetingActionStatus, string> = { OPEN: 'Open', DONE: 'Done', DROPPED: 'Dropped' };

/** What an action can be about. */
export const MEETING_LINK_KINDS = ['RFI', 'NCR', 'VARIATION'] as const;
export type MeetingLinkKind = (typeof MEETING_LINK_KINDS)[number];
export const MEETING_LINK_KIND_LABELS: Record<MeetingLinkKind, string> = { RFI: 'RFI', NCR: 'NCR', VARIATION: 'Variation' };

export interface MeetingLinkDto {
  kind: MeetingLinkKind;
  id: string;
  /** "RFI-2026-0004 Column C7 reinforcement" */
  label: string;
}

export interface MeetingAttendeeDto {
  id: string;
  userId: string | null;
  name: string;
  /** Their side: the client, the consultant, a subcontractor; null for our own staff */
  organisation: string | null;
  email: string | null;
  phone: string | null;
  present: boolean;
}

export interface MeetingPointDto {
  id: string;
  kind: MeetingPointKind;
  text: string;
}

export interface MeetingActionDto {
  id: string;
  meetingId: string;
  meetingNo: string;
  meetingTitle: string;
  heldOn: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  text: string;
  ownerUserId: string | null;
  ownerName: string;
  dueOn: string | null;
  status: MeetingActionStatus;
  doneOn: string | null;
  closeNote: string | null;
  closedByName: string | null;
  link: MeetingLinkDto | null;
  /** Days past its due date while open (0 on the day); null when not due yet, closed or with no date */
  daysOverdue: number | null;
  /** Days to its due date while open and not yet due */
  daysLeft: number | null;
  /** The caller may close, drop, reopen or move it: its owner, whoever recorded the meeting, and managers */
  canUpdate: boolean;
}

export interface MeetingDto {
  id: string;
  meetingNo: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  kind: MeetingKind;
  heldOn: string;
  startTime: string | null;
  venue: string | null;
  status: MeetingStatus;
  present: number;
  decisionCount: number;
  actionCount: number;
  openActionCount: number;
  issuedAt: string | null;
  createdByName: string;
}

export interface MeetingDetailDto extends MeetingDto {
  chairedBy: string | null;
  agenda: string | null;
  nextOn: string | null;
  attendees: MeetingAttendeeDto[];
  points: MeetingPointDto[];
  actions: MeetingActionDto[];
  /** Actions still open from the project's earlier meetings, to be reviewed at this one */
  earlierActions: MeetingActionDto[];
  issuedByName: string | null;
  /** The minutes can change: a draft, by whoever recorded it or a manager */
  canEdit: boolean;
  /** An issued meeting can be taken back to draft to correct it (managers) */
  canRevise: boolean;
}

export interface MeetingListDto {
  items: MeetingDto[];
  summary: { thisMonth: number; drafts: number; openActions: number; overdueActions: number };
}

export interface MeetingActionListDto {
  items: MeetingActionDto[];
  summary: { open: number; overdue: number; dueThisWeek: number; doneThisMonth: number };
}

/** The RFIs, NCRs and variations of a project an action can be about. */
export interface MeetingLinkOptionsDto {
  rfis: MeetingLinkDto[];
  ncrs: MeetingLinkDto[];
  variations: MeetingLinkDto[];
}

/** After issuing: how many were emailed the minutes and how many owners told of their actions. */
export interface MeetingIssueResultDto {
  meeting: MeetingDetailDto;
  emailed: number;
  notified: number;
}
