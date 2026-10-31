/** The lists that keep saved views. The key is the list page's path without the slash. */
export const SAVED_VIEW_LISTS = ['dpr', 'progress', 'material-requests', 'requests-to-order', 'purchase-orders', 'bills', 'machinery', 'expenses', 'measurements', 'vendor-bills', 'work-orders', 'subcontract-bills', 'inspections', 'projects', 'clients', 'vendors', 'users', 'risks', 'variations', 'inward-letters', 'outward-letters'] as const;
export type SavedViewList = (typeof SAVED_VIEW_LISTS)[number];

/**
 * What a view remembers: the list's filters and sort as query-string values (the same names the list puts in its URL),
 * and the columns shown, in order. The project is left out on purpose: it follows the header's project switcher.
 */
export interface SavedViewState {
  filters: Record<string, string>;
  columns?: string[];
}

export interface SavedViewDto {
  id: string;
  list: SavedViewList;
  name: string;
  /** Everyone in the company sees a shared view; only its owner (or an admin) can change or delete it. */
  shared: boolean;
  state: SavedViewState;
  ownerId: string;
  ownerName: string;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A saved view's state may not be bigger than this (JSON characters). */
export const SAVED_VIEW_MAX_STATE = 4000;
export const SAVED_VIEW_MAX_PER_USER = 50;
