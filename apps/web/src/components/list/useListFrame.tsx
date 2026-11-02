'use client';

import React from 'react';
import type { ListViewKind, SavedViewList, SortOrder, SubmissionStatus, SubmissionType } from '@erp/shared';
import { SUBMISSION_STATUS_LABELS, mayApproveTypeAtAll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useListPage } from '@/lib/listPage';
import { usePendingApprovals } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { useColumnChoice, type ListColumn } from './DataTable';
import { FilterChips, type ChipLabels } from './FilterChips';
import { ListViews, type BuiltInView } from './ListViews';
import { standardViews } from './views';
import { ViewToggle } from './ListViewsOfData';

/** Where the list lives: a page of its own keeps saved views under a `SavedViewList`; a list in a tab of a page (`url: false`) only names where its columns are kept. */
type ListFrameTarget = { list: SavedViewList; url?: true } | { list: string; url: false };

/**
 * Everything a list page shares: its filters in the URL, the header's project, the views across the
 * top, the columns chosen and the filter chips. A submission list (`type`) gets the standard views (Waiting for me, Mine,
 * Sent back, This week); any other list has All and its own `moreViews`. With `fixedProject` (a project page tab) or
 * `url: false` (a list in a page's tab) there are no views and nothing goes in the URL; the table features stay.
 */
export function useListFrame<S extends string, T>(opts: ListFrameTarget & {
  /** A submission list's type, for its standard views; left out for registers and masters. */
  type?: SubmissionType;
  /** Filters this list understands besides q and the sort. */
  keys: readonly string[];
  sortBy: S;
  sortOrder: SortOrder;
  sortFields: readonly S[];
  fixedProject?: string;
  /** False for a company-wide list (clients, users…): the header's project neither filters it nor resets its page. */
  projectScoped?: boolean;
  /** The project a link opened the list on (`?projectId=`), handed to the header's switcher. */
  initialProject?: string;
  /** Filters a list in a tab starts with (it has no URL to read them from). */
  initialFilters?: Record<string, string>;
  /** Name of the no-filter view, when "All" would mislead (the risk register opens on what is open). */
  allLabel?: string;
  /** The list's columns, given the sort arrows' state. */
  columns: (sortOrderFor: (key: S) => 'ascend' | 'descend' | null) => ListColumn<T>[];
  /** Views of this list after the standard ones. */
  moreViews?: BuiltInView[];
  /** Chip wording for this list's own filters. */
  chipLabels?: ChipLabels;
  statusLabels?: Record<string, string>;
  /**
   * The views this list's data fits (ARCHITECTURE "Views that fit the data"), the first one the default: a pipeline offers
   * a board, a record filed each day by each site a grid of days. Left out, the list is a table alone.
   */
  viewKinds?: readonly ListViewKind[];
}) {
  const { user } = useAuth();
  const [projectFilter, setProjectFilter] = useProjectScope(opts.initialProject);
  const scoped = opts.projectScoped !== false;
  const projectId = opts.fixedProject ?? (scoped ? projectFilter : undefined);
  const inUrl = !opts.fixedProject && opts.url !== false;
  const viewKinds = opts.viewKinds ?? [];
  const keys = viewKinds.length > 1 ? [...opts.keys, 'view'] : opts.keys;
  const page = useListPage<S>({ keys, sortBy: opts.sortBy, sortOrder: opts.sortOrder, sortFields: opts.sortFields, url: inUrl, scope: projectId, initial: opts.initialFilters });
  const columns = opts.columns(page.sortOrderFor);
  const choice = useColumnChoice(opts.list, columns);
  const statusLabels: Record<string, string> = opts.statusLabels ?? SUBMISSION_STATUS_LABELS;
  // Waiting for me says how many: the approvals queue, of this type, in the header's project.
  const approver = !!user && !!opts.type && inUrl && mayApproveTypeAtAll(user, opts.type);
  const { data: pending } = usePendingApprovals(approver);
  const waiting = approver && pending ? pending.filter((p) => p.type === opts.type && (!projectId || p.projectId === projectId)).length : undefined;
  const builtIns = (opts.type ? standardViews(user, opts.type, waiting) : [{ key: 'all', label: 'All', filters: {} }]).map((v) => (v.key === 'all' && opts.allLabel ? { ...v, label: opts.allLabel } : v));

  const { view: _shownAs, ...withoutView } = page.filters;
  const views = !inUrl ? null : (
    <ListViews
      list={opts.list as SavedViewList}
      builtIns={[...builtIns, ...(opts.moreViews ?? [])]}
      filters={withoutView}
      columns={choice.visible}
      onApply={(filters, columns) => {
        // A view sets the filters, not the way the list is shown: Table stays Table.
        page.setFilters(page.filters.view ? { ...filters, view: page.filters.view } : filters);
        if (columns) choice.setChosen(columns);
      }}
    />
  );

  // Clearing the filters keeps the view: Board stays Board.
  const clearFilters = () => (page.filters.view ? page.setFilters({ view: page.filters.view }) : page.clear());

  const chips = (
    <FilterChips
      filters={page.filters}
      labels={{
        status: (v) => `Status: ${statusLabels[v] ?? v}`,
        mine: () => 'Mine',
        ...opts.chipLabels,
      }}
      onClear={page.clear}
      onClearAll={() => clearFilters()}
    />
  );

  // The phone's "Filters (N)": each filter on counts once (a date range is one), and so does the project unless it is fixed.
  const filterKeys = Object.entries(page.filters).filter(([k, v]) => !!v && k !== 'q' && k !== 'sortBy' && k !== 'sortOrder' && k !== 'to' && k !== 'view').map(([k]) => k);
  const ownCount = filterKeys.length + (page.filters.to && !page.filters.from ? 1 : 0);
  const projectCounts = !opts.fixedProject && scoped && !!projectFilter;
  const filterState = {
    count: ownCount + (projectCounts ? 1 : 0),
    clear: () => {
      clearFilters();
      if (projectCounts) setProjectFilter(undefined);
    },
  };
  const view: ListViewKind = viewKinds.includes(page.filters.view as ListViewKind) ? (page.filters.view as ListViewKind) : (viewKinds[0] ?? 'table');
  const setView = (v: ListViewKind) => page.setFilter('view', v === viewKinds[0] ? undefined : v);

  return {
    page,
    /** For `ListToolbar`'s `filters`: how many are on, and Clear. */
    filterState,
    columns,
    projectId,
    projectFilter,
    setProjectFilter,
    choice,
    views,
    chips,
    /** For the table's empty state: filters narrowed it to nothing, so it offers Clear filters rather than the New button. */
    empty: { filtered: Object.entries(page.filters).some(([k, v]) => !!v && k !== 'sortBy' && k !== 'sortOrder' && k !== 'view'), clear: clearFilters },
    /** The view on (the first of `viewKinds` unless the address says another), and the toggle for the toolbar's `extra`. */
    view,
    setView,
    viewToggle: viewKinds.length > 1 ? <ViewToggle kinds={viewKinds} value={view} onChange={setView} /> : null,
    status: page.filters.status as SubmissionStatus | undefined,
    setStatus: (v?: SubmissionStatus) => page.setFilter('status', v),
    dateRange: {
      from: page.filters.from,
      to: page.filters.to,
      onChange: (from?: string, to?: string) => page.setFilters({ ...page.filters, from: from ?? '', to: to ?? '' }),
    },
  };
}
