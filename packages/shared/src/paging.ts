/** Server-side paging, search and sort shared by every list endpoint that returns `Paginated<T>`. */

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PAGE_SIZE = 25;
/** Upper bound for one page; dropdowns and Excel exports ask for this much. */
export const MAX_PAGE_SIZE = 500;

/** Columns each list can be sorted by (`sortBy`). The first one is the default. */
export const LIST_SORT_FIELDS = {
  progress: ['date', 'createdAt', 'submittedAt', 'quantity', 'status', 'project', 'activity', 'submittedBy'],
  dpr: ['date', 'createdAt', 'submittedAt', 'status', 'project', 'submittedBy'],
  materialRequests: ['createdAt', 'requestNo', 'requiredDate', 'priority', 'status', 'project', 'submittedBy'],
  projects: ['status', 'code', 'name', 'type', 'startDate', 'endDate', 'contractValue', 'createdAt'],
  users: ['fullName', 'email', 'role', 'isActive', 'createdAt'],
} as const;

export type ProgressSortField = (typeof LIST_SORT_FIELDS.progress)[number];
export type DprSortField = (typeof LIST_SORT_FIELDS.dpr)[number];
export type MaterialRequestSortField = (typeof LIST_SORT_FIELDS.materialRequests)[number];
export type ProjectSortField = (typeof LIST_SORT_FIELDS.projects)[number];
export type UserSortField = (typeof LIST_SORT_FIELDS.users)[number];

/** Query parameters understood by every paged list. */
export interface ListParams<S extends string = string> {
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Free-text search; each list documents which columns it matches. */
  q?: string;
  sortBy?: S;
  sortOrder?: SortOrder;
}
