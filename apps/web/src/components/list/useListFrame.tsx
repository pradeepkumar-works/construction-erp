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

/**
 * Everything a submission list page shares (UI roadmap item 55): its filters in the URL, the header's project, the
 * views across the top, the columns chosen and the filter chips. With `fixedProject` (a project page tab) there are no
 * views and nothing goes in the URL; the table features stay.
 */
export function useListFrame<S extends string, T>(opts: {
  list: SavedViewList;
  type: SubmissionType;
  /** Filters this list understands besides q and the sort. */
  keys: readonly string[];
  sortBy: S;
  sortOrder: SortOrder;
  sortFields: readonly S[];
  fixedProject?: string;
  /** The list's columns, given the sort arrows' state. */
  columns: (sortOrderFor: (key: S) => 'ascend' | 'descend' | null) => ListColumn<T>[];
  /** Views of this list after the standard ones. */
  moreViews?: BuiltInView[];
  /** Chip wording for this list's own filters. */
  chipLabels?: ChipLabels;
  statusLabels?: Record<SubmissionStatus, string>;
}) {
  const { user } = useAuth();
  const [projectFilter, setProjectFilter] = useProjectScope();
  const projectId = opts.fixedProject ?? projectFilter;
  const page = useListPage<S>({ keys: opts.keys, sortBy: opts.sortBy, sortOrder: opts.sortOrder, sortFields: opts.sortFields, url: !opts.fixedProject, scope: projectId });
  const columns = opts.columns(page.sortOrderFor);
  const choice = useColumnChoice(opts.list, columns);
  const statusLabels = opts.statusLabels ?? SUBMISSION_STATUS_LABELS;

  const views = opts.fixedProject ? null : (
    <ListViews
      list={opts.list}
      builtIns={[...standardViews(user, opts.type), ...(opts.moreViews ?? [])]}
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
        status: (v) => `Status: ${statusLabels[v as SubmissionStatus] ?? v}`,
        mine: () => 'Mine',
        ...opts.chipLabels,
      }}
      onClear={page.clear}
      onClearAll={() => page.clear()}
    />
  );

  return {
    page,
    columns,
    projectId,
    projectFilter,
    setProjectFilter,
    choice,
    views,
    chips,
    status: page.filters.status as SubmissionStatus | undefined,
    setStatus: (v?: SubmissionStatus) => page.setFilter('status', v),
    dateRange: {
      from: page.filters.from,
      to: page.filters.to,
      onChange: (from?: string, to?: string) => page.setFilters({ ...page.filters, from: from ?? '', to: to ?? '' }),
    },
  };
}
