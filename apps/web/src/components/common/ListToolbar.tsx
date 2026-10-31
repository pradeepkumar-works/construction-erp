'use client';

import React, { useState } from 'react';
import { Button, Drawer, Flex, Select, theme } from 'antd';
import { FilterOutlined } from '@/components/common/icons';
import type { SubmissionStatus } from '@erp/shared';
import { SUBMISSION_STATUSES, SUBMISSION_STATUS_LABELS } from '@erp/shared';
import { useIsPhone } from '@/lib/screen';
import { ProjectSelect } from './ProjectSelect';
import { SearchBox } from './SearchBox';
import { CardToolbar } from './CardToolbar';

/** How many filters are on, and how to take them all off (`useListFrame`'s `filterState`). */
export interface ToolbarFilters {
  count: number;
  clear: () => void;
}

/**
 * The strip above a list: search, the project and status filters and the list's own (`children`), and its actions
 * (`extra`). On a phone it is the search and a "Filters (N)" button, which opens the filters in a drawer from
 * the bottom with Apply and Clear; the actions stay beside it.
 */
export function ListToolbar({
  projectId,
  onProject,
  status,
  onStatus,
  search,
  onSearch,
  searchPlaceholder,
  searchLabel,
  hideProject,
  children,
  extra,
  statusLabels = SUBMISSION_STATUS_LABELS,
  filters,
}: {
  projectId?: string;
  onProject: (v?: string) => void;
  status?: SubmissionStatus;
  /** Omit for lists without an approval status. */
  onStatus?: (v?: SubmissionStatus) => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  /** Accessible name of the search box, e.g. "Search material requests". */
  searchLabel?: string;
  /** Inside a project page the project filter is fixed. */
  hideProject?: boolean;
  children?: React.ReactNode;
  /** Right-aligned actions such as Export. */
  extra?: React.ReactNode;
  /** Status wording for this kind of entry. */
  statusLabels?: Record<SubmissionStatus, string>;
  /** The filters on, for the phone's Filters button; left out, it counts the project and status. */
  filters?: ToolbarFilters;
}) {
  const { token } = theme.useToken();
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const projectFilter = hideProject ? null : <ProjectSelect value={projectId} onChange={(v) => onProject(v)} />;
  const statusFilter = onStatus ? (
    <Select allowClear placeholder="All statuses" aria-label="Status" value={status} onChange={(v) => onStatus(v)} style={{ width: 180 }} options={SUBMISSION_STATUSES.map((s) => ({ value: s, label: statusLabels[s] }))} />
  ) : null;
  const searchBox = onSearch ? <SearchBox value={search ?? ''} onChange={onSearch} placeholder={searchPlaceholder} aria-label={searchLabel} width={phone ? '100%' : undefined} /> : null;

  if (!phone)
    return (
      <CardToolbar wrap gap={8} align="center">
        {searchBox}
        {projectFilter}
        {statusFilter}
        {children}
        {extra ? <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{extra}</div> : null}
      </CardToolbar>
    );

  const hasFilters = !!(projectFilter || statusFilter || React.Children.toArray(children).length);
  const count = filters?.count ?? (projectFilter && projectId ? 1 : 0) + (statusFilter && status ? 1 : 0);
  const clear =
    filters?.clear ??
    (() => {
      if (projectFilter) onProject(undefined);
      onStatus?.(undefined);
    });
  const filtersButton = hasFilters ? (
    <Button icon={<FilterOutlined />} onClick={() => setOpen(true)} aria-haspopup="dialog" style={{ flexShrink: 0 }}>
      {count ? `Filters (${count})` : 'Filters'}
    </Button>
  ) : null;
  return (
    <CardToolbar vertical gap={token.marginXS}>
      {searchBox || filtersButton ? (
        <Flex gap={token.marginXS} align="center">
          {searchBox ? <div style={{ flex: 1, minWidth: 0 }}>{searchBox}</div> : null}
          {filtersButton}
        </Flex>
      ) : null}
      {extra ? (
        <Flex wrap gap={token.marginXS} justify="flex-end">
          {extra}
        </Flex>
      ) : null}
      {hasFilters ? (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          placement="bottom"
          size="auto"
          title={count ? `Filters (${count})` : 'Filters'}
          rootClassName="list-filter-drawer"
          styles={{ wrapper: { maxHeight: '85vh' }, footer: { paddingBottom: `calc(${token.paddingSM}px + env(safe-area-inset-bottom))` } }}
          footer={
            <Flex gap={token.marginXS} justify="flex-end">
              <Button onClick={clear} disabled={!count}>
                Clear
              </Button>
              <Button type="primary" onClick={() => setOpen(false)}>
                Apply
              </Button>
            </Flex>
          }
        >
          <Flex vertical gap={token.marginSM} className="list-filter-fields">
            {projectFilter}
            {statusFilter}
            {children}
          </Flex>
        </Drawer>
      ) : null}
    </CardToolbar>
  );
}
