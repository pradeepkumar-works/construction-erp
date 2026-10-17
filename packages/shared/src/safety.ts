/** Safety (v4 item 40): incident and near-miss register, toolbox talks and permits to work. */
import { NOTIFICATION_TYPES, type NotificationType, type SafetyIncidentStatus, type SafetyIncidentType, type WorkPermitStatus, type WorkPermitType } from './enums';
import type { AttachmentDto } from './types';

/** Incidents that hurt someone badly enough to lose time; they reset the "days without a lost-time injury" count. */
export const LOST_TIME_TYPES: SafetyIncidentType[] = ['LOST_TIME', 'FATALITY'];

/** Incidents that tell the project's approvers as well as its safety officer (everything but a near miss). */
export const isReportableIncident = (type: SafetyIncidentType) => type !== 'NEAR_MISS';

/** Types where someone was hurt, so the number of people injured is asked for. */
export const INJURY_TYPES: SafetyIncidentType[] = ['FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'FATALITY'];

/** A permit is valid for at most this long; longer work gets a fresh permit. */
export const PERMIT_MAX_DAYS = 7;

/** Standard precautions to tick when a permit is requested and checked before it is issued. */
export const PERMIT_PRECAUTIONS: Record<WorkPermitType, string[]> = {
  HOT_WORK: [
    'Area cleared of flammable material',
    'Fire extinguisher at the spot',
    'Gas cylinders upright and chained, flashback arrestors fitted',
    'Welding screen, face shield and gloves',
    'Fire watch for 30 minutes after work',
  ],
  WORK_AT_HEIGHT: [
    'Full body harness, anchored',
    'Scaffold inspected and tagged',
    'Edge protection / guard rails in place',
    'Area below barricaded',
    'Tools tied or in a bag',
  ],
  EXCAVATION: [
    'Underground services located and marked',
    'Sides shored, benched or sloped',
    'Spoil kept 1 m back from the edge',
    'Barricade and warning signs',
    'Safe ladder access every 7.5 m',
  ],
  CONFINED_SPACE: [
    'Atmosphere tested (oxygen, gas) before entry',
    'Ventilation running',
    'Standby person at the entry',
    'Rescue tripod and harness ready',
    'Entry log kept',
  ],
  ELECTRICAL: [
    'Supply isolated and locked out, tag fitted',
    'Circuit tested dead',
    'Insulated tools and rubber gloves',
    'Earthing checked',
    'Only a licensed electrician works on it',
  ],
  LIFTING: [
    'Crane fitness certificate and operator licence checked',
    'Load weight within the load chart',
    'Slings, shackles and hooks inspected',
    'Outriggers on firm ground',
    'Lifting zone barricaded, banksman appointed',
  ],
  OTHER: ['Method explained to the workers', 'PPE checked', 'Area barricaded'],
};

/** Topics to pick from when recording a toolbox talk; any other topic can be typed. */
export const TOOLBOX_TOPICS = [
  'PPE: helmet, shoes, gloves, reflective jacket',
  'Working at height and harness use',
  'Excavation and trench safety',
  'Housekeeping and slips, trips, falls',
  'Electrical safety at site',
  'Hot work and fire prevention',
  'Manual handling and lifting',
  'Traffic management and reversing vehicles',
  'Heat stress, water and rest',
  'First aid and emergency numbers',
  'Scaffold safety',
  'Crane and lifting operations',
];

/** An issued permit whose validity has run out (it should be closed or a new one taken). */
export const permitExpired = (p: { status: WorkPermitStatus; validTo: string }, now: Date = new Date()) => p.status === 'ISSUED' && new Date(p.validTo).getTime() < now.getTime();

/**
 * Notification types older phone builds know. `GET /notifications` lists only these unless the client asks for
 * `allTypes`, because those builds crash on a type they have no icon for.
 */
export const LEGACY_NOTIFICATION_TYPES: NotificationType[] = NOTIFICATION_TYPES.filter(
  (t) => t !== 'SAFETY' && t !== 'MACHINERY' && t !== 'IMPREST' && t !== 'COMPLIANCE' && t !== 'DEFECT' && t !== 'WATCH_LIST' && t !== 'MORNING_BRIEF',
);

export interface SafetyIncidentDto {
  id: string;
  projectId: string;
  projectName: string;
  incidentNo: string;
  type: SafetyIncidentType;
  date: string;
  /** HH:mm */
  time: string | null;
  location: string;
  description: string;
  injuredCount: number;
  injuredNames: string | null;
  contractor: string | null;
  immediateAction: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  daysLost: number | null;
  status: SafetyIncidentStatus;
  closedAt: string | null;
  closedByName: string | null;
  closureNote: string | null;
  reportedById: string;
  reportedByName: string;
  attachments: AttachmentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ToolboxTalkDto {
  id: string;
  projectId: string;
  projectName: string;
  talkNo: string;
  date: string;
  topic: string;
  conductedBy: string;
  contractor: string | null;
  attendeeCount: number;
  attendees: string | null;
  durationMinutes: number | null;
  notes: string | null;
  recordedById: string;
  recordedByName: string;
  attachments: AttachmentDto[];
  createdAt: string;
}

export interface WorkPermitDto {
  id: string;
  projectId: string;
  projectName: string;
  permitNo: string;
  type: WorkPermitType;
  location: string;
  description: string;
  contractor: string | null;
  workerCount: number | null;
  workers: string | null;
  /** ISO date-times */
  validFrom: string;
  validTo: string;
  precautions: string[];
  status: WorkPermitStatus;
  /** Issued and past validTo */
  expired: boolean;
  requestedById: string;
  requestedByName: string;
  issuedByName: string | null;
  issuedAt: string | null;
  /** Conditions on issue, or why it was rejected */
  issueNote: string | null;
  closedByName: string | null;
  closedAt: string | null;
  closeNote: string | null;
  attachments: AttachmentDto[];
  createdAt: string;
}

/** Safety at a glance for a project, or every project the user sees. */
export interface SafetySummaryDto {
  /** Calendar month to date */
  incidentsThisMonth: number;
  nearMissesThisMonth: number;
  openIncidents: number;
  /** Calendar year to date */
  lostTimeThisYear: number;
  injuredThisYear: number;
  /** Days since the last lost-time injury or fatality; null when there has been none. */
  daysSinceLostTime: number | null;
  lastLostTimeDate: string | null;
  toolboxTalksThisMonth: number;
  attendeesThisMonth: number;
  permitsRequested: number;
  permitsActive: number;
  permitsExpired: number;
  /** Calendar year to date, every type with at least one */
  byType: { type: SafetyIncidentType; count: number }[];
}
