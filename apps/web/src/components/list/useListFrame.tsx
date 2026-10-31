'use client';

import React from 'react';
import type { SavedViewList, SortOrder, SubmissionStatus, SubmissionType } from '@erp/shared';
import { SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useListPage } from '@/lib/listPage';
import { useProjectScope } from '@/lib/project-scope';
import { useColumnChoice, type ListColumn } from './DataTable';
import { FilterChips, type ChipLabels } from './FilterChips';
import { ListViews, type BuiltInView } from './ListViews';
import { standardViews } from './views';

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
}) {
  const { user } = useAuth();
  const [projectFilter, setProjectFilter] = useProjectScope(opts.initialProject);
  const scoped = opts.projectScoped !== false;
  const projectId = opts.fixedProject ?? (scoped ? projectFilter : undefined);
  const inUrl = !opts.fixedProject && opts.url !== false;
  const page = useListPage<S>({ keys: opts.keys, sortBy: opts.sortBy, sortOrder: opts.sortOrder, sortFields: opts.sortFields, url: inUrl, scope: projectId, initial: opts.initialFilters });
  const columns = opts.columns(page.sortOrderFor);
  const choice = useColumnChoice(opts.list, columns);
  const statusLabels: Record<string, string> = opts.statusLabels ?? SUBMISSION_STATUS_LABELS;
  const builtIns = (opts.type ? standardViews(user, opts.type) : [{ key: 'all', label: 'All', filters: {} }]).map((v) => (v.key === 'all' && opts.allLabel ? { ...v, label: opts.allLabel } : v));

  const views = !inUrl ? null : (
    <ListViews
      list={opts.list as SavedViewList}
      builtIns={[...builtIns, ...(opts.moreViews ?? [])]}
      filters={page.filters}
      columns={choice.visible}
      onApply={(filters, columns) => {
        page.setFilters(filters);
        if (columns) choice.setChosen(columns);
      }}
    />
  );

  const chips = (
    <FilterChips
      filters={page.filters}
      labels={{
        status: (v) => `Status: ${statusLabels[v] ?? v}`,
        mine: () => 'Mine',
        ...opts.chipLabels,
      }}
      onClear={page.clear}
      onClearAll={() => page.clear()}
    />
  );

  // The phone's "Filters (N)": each filter on counts once (a date range is one), and so does the project unless it is fixed.
  const filterKeys = Object.entries(page.filters).filter(([k, v]) => !!v && k !== 'q' && k !== 'sortBy' && k !== 'sortOrder' && k !== 'to').map(([k]) => k);
  const ownCount = filterKeys.length + (page.filters.to && !page.filters.from ? 1 : 0);
  const projectCounts = !opts.fixedProject && scoped && !!projectFilter;
  const filterState = {
    count: ownCount + (projectCounts ? 1 : 0),
    clear: () => {
      page.clear();
      if (projectCounts) setProjectFilter(undefined);
    },
  };

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
    empty: { filtered: Object.entries(page.filters).some(([k, v]) => !!v && k !== 'sortBy' && k !== 'sortOrder'), clear: () => page.clear() },
    status: page.filters.status as SubmissionStatus | undefined,
    setStatus: (v?: SubmissionStatus) => page.setFilter('status', v),
    dateRange: {
      from: page.filters.from,
      to: page.filters.to,
      onChange: (from?: string, to?: string) => page.setFilters({ ...page.filters, from: from ?? '', to: to ?? '' }),
    },
  };
}
