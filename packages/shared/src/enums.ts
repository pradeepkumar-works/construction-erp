/** String-literal unions that mirror the Prisma enums in apps/api. Keep both in sync. */

export const PROJECT_TYPES = ['ROAD', 'BUILDING', 'WATER_SUPPLY'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const REVIEW_DECISIONS = ['APPROVE', 'REJECT', 'REQUEST_CHANGES'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const MATERIAL_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type MaterialPriority = (typeof MATERIAL_PRIORITIES)[number];

export const SUBMISSION_TYPES = ['PROGRESS', 'DPR', 'MATERIAL_REQUEST'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const ROLE_KEYS = [
  'ADMIN',
  'MANAGEMENT',
  'PROJECT_MANAGER',
  'TEAM_LEADER',
  'SITE_ENGINEER',
  'STORE_MANAGER',
  'QUANTITY_SURVEYOR',
  'PROCUREMENT_MANAGER',
  'QA_QC_ENGINEER',
  'ACCOUNTS_MANAGER',
  'HR_MANAGER',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const WEATHER_OPTIONS = ['SUNNY', 'CLOUDY', 'RAINY', 'WINDY', 'HOT'] as const;
export type Weather = (typeof WEATHER_OPTIONS)[number];

export const NOTIFICATION_TYPES = [
  'SUBMISSION_SUBMITTED',
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
  'SUBMISSION_CHANGES_REQUESTED',
  'DPR_REMINDER',
  'APPROVAL_DIGEST',
  'LOW_STOCK',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PUSH_PLATFORMS = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** RECEIPT = GRN against an approved material request, ISSUE = handed out at site, ADJUSTMENT = opening stock or count correction. */
export const STOCK_ENTRY_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT'] as const;
export type StockEntryType = (typeof STOCK_ENTRY_TYPES)[number];
