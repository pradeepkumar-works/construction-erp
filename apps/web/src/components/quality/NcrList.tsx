'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Typography, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { NcrDto, NcrSeverity, NcrSortField, NcrStatus } from '@erp/shared';
import { LIST_SORT_FIELDS, NCR_SEVERITIES, NCR_SEVERITY_LABELS, NCR_STATUSES, NCR_STATUS_LABELS, canRaiseNcr } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNcrs } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { NcrStatusTag, SeverityTag } from './qualityUi';
import { NcrFormModal } from './NcrFormModal';

const KEYS = ['status', 'severity', 'active', 'mine'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Non-conformance reports, on the Quality page and a project's Quality tab. The drawer is the parent's, so tests can open NCRs too. */
export function NcrList({ projectId: fixedProject, onOpen }: { projectId?: string; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const frame = useListFrame<NcrSortField, NcrDto>({
    list: 'ncrs',
    url: false,
    keys: KEYS,
    sortBy: 'raisedOn',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.ncrs,
    fixedProject,
    statusLabels: NCR_STATUS_LABELS,
    chipLabels: {
      severity: (v) => `Severity: ${NCR_SEVERITY_LABELS[v as NcrSeverity] ?? v}`,
      active: () => 'Not closed',
      mine: () => 'Action by me',
    },
    columns: (sortOrderFor): ListColumn<NcrDto>[] => {
      const sort = (key: NcrSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'Raised', dataIndex: 'raisedOn', width: 110, render: (v) => formatDate(v), ...sort('raisedOn') },
        { title: 'No.', dataIndex: 'ncrNo', width: 150, className: 'mono', ...sort('ncrNo') },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, render: (v: string, r: NcrDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> } satisfies ListColumn<NcrDto>]),
        {
          title: 'Non-conformance',
          key: 'title',
          locked: true,
          width: 300,
          render: (_, r) => (
            <div>
              <RecordLink onOpen={() => onOpen(r.id)}>{r.title}</RecordLink>
              <Sub>{[r.location, r.testNo, r.inspectionNo].filter(Boolean).join(' · ') || r.activityName}</Sub>
            </div>
          ),
        },
        { title: 'Severity', dataIndex: 'severity', width: 100, ...sort('severity'), render: (v: NcrSeverity) => <SeverityTag severity={v} /> },
        {
          title: 'Due',
          dataIndex: 'dueDate',
          width: 120,
          ...sort('dueDate'),
          render: (v: string | null, r) => (v ? <Typography.Text type={r.overdue ? 'danger' : undefined}>{formatDate(v)}</Typography.Text> : <Sub>-</Sub>),
        },
        { key: 'actionByName', title: 'Action by', dataIndex: 'actionByName', width: 150, render: (v: string | null) => v ?? <Sub>-</Sub> },
        { title: 'Status', dataIndex: 'status', fixed: 'right' as const, width: 120, ...sort('status'), render: (v: NcrStatus) => <NcrStatusTag status={v} /> },
      ];
    },
  });
  const { page } = frame;
  const status = page.filters.status as NcrStatus | undefined;
  const severity = page.filters.severity as NcrSeverity | undefined;
  const active = page.filters.active === '1';
  const mine = page.filters.mine === '1';
  const { data, isLoading, isFetching, error, refetch } = useNcrs({
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    projectId: frame.projectId,
    status,
    severity,
    active: active || undefined,
    mine: mine || undefined,
  });
  const filtered = !!(status || severity || active || mine || page.params.q);

  const newButton = user && canRaiseNcr(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      New NCR
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., title, location"
        searchLabel="Search NCRs"
        extra={newButton}
      >
        <Select<NcrStatus> allowClear placeholder="All statuses" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 150 }} options={NCR_STATUSES.map((s) => ({ value: s, label: NCR_STATUS_LABELS[s] }))} />
        <Select<NcrSeverity> allowClear placeholder="Any severity" aria-label="Severity" value={severity} onChange={(v) => page.setFilter('severity', v)} style={{ width: 140 }} options={NCR_SEVERITIES.map((s) => ({ value: s, label: NCR_SEVERITY_LABELS[s] }))} />
        <Checkbox checked={active} onChange={(e) => page.setFilter('active', e.target.checked ? '1' : undefined)}>
          Not closed
        </Checkbox>
        <Checkbox checked={mine} onChange={(e) => page.setFilter('mine', e.target.checked ? '1' : undefined)}>
          Action by me
        </Checkbox>
      </ListToolbar>
      <DataTable<NcrDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<NcrDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="entries" title={filtered ? 'No NCR matches these filters' : 'No NCR raised'} />}
        emptyAction={newButton}
      />
      <NcrFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={fixedProject} onSaved={(x) => onOpen(x.id)} />
    </>
  );
}
