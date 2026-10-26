import type { ProjectStatus, ProjectType } from './enums';
import type { DailyReportDto, InspectionDto, RaBillDto } from './types';

/**
 * The client portal (v3 item 32): what the client's engineer or consultant sees of a project they are a member of.
 * Approved work only; RA bills once sent to the client; inspections once requested.
 */
export interface PortalProjectDto {
  id: string;
  code: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  clientName: string | null;
  consultantName: string | null;
  workOrderNo: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  contractValue: string | null;
  projectManagerName: string | null;
  /** From approved progress, weighted by BOQ amount */
  physicalProgressPct: number;
  /** Share of the contract period gone by today; null without both dates */
  timeElapsedPct: number | null;
  lastDprDate: string | null;
  /** Bills sent and waiting for the client's certificate */
  billsToCertify: number;
  /** Inspections requested and not yet decided */
  openInspections: number;
}

export interface PortalActivityDto {
  id: string;
  name: string;
  unit: string;
  plannedQty: string;
  doneQty: string;
  pct: number;
  /** The agreed programme: the dates frozen in the project's baseline, never the contractor's working re-plan; null without a baseline */
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface PortalProjectDetailDto extends PortalProjectDto {
  /** Where the activities' dates come from: the frozen baseline, or none until the PM freezes one */
  programme: 'BASELINE' | 'NONE';
  activities: PortalActivityDto[];
}

/** An approved DPR as the client reads it. */
export type PortalDprDto = Pick<
  DailyReportDto,
  'id' | 'projectId' | 'date' | 'weather' | 'siteCondition' | 'manpower' | 'machinery' | 'materialReceived' | 'workExecuted' | 'testsConducted' | 'safetyObservations' | 'issues' | 'nextDayPlan' | 'totalManpower' | 'attachments' | 'submittedByName' | 'reviewedByName' | 'reviewedAt'
>;

export interface PortalInspectionDto
  extends Pick<InspectionDto, 'id' | 'projectId' | 'inspectionNo' | 'activityName' | 'holdPoint' | 'date' | 'location' | 'remarks' | 'checklistName' | 'checklist' | 'status' | 'submittedByName' | 'reviewedByName' | 'reviewedAt' | 'reviewNote' | 'attachments'> {
  witnessedByName: string | null;
  witnessedAt: string | null;
  witnessNote: string | null;
}

/** A bill sent to the client, as on GET /ra-bills/:id. */
export type PortalBillDto = RaBillDto;
