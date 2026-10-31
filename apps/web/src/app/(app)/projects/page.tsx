'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Progress, Select, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { ProjectSortField, ProjectStatus, ProjectSummary, ProjectType } from '@erp/shared';
import { LIST_SORT_FIELDS, NO_VERTICAL, PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_TYPES, PROJECT_TYPE_LABELS, canEditProjects, isGuest } from '@erp/shared';
import { useMasterList, useProjectsPage, LIST_START } from '@/lib/queries';
import { useVerticalScope } from '@/lib/project-scope';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { PROJECT_EXPORT } from '@/lib/exportColumns';
import { ExportButton } from '@/components/common/ExportButton';
import { useAuth } from '@/lib/auth';
import { formatDate, formatINR, progressStatus, toNumber } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ProjectStatusTag, ProjectTypeTag } from '@/components/common/StatusTag';
import { ProjectFormModal } from '@/components/projects/ProjectFormModal';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { BRAND } from '@/lib/brand';

const KEYS = ['status', 'type'] as const;

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

function projectColumns(sortOrderFor: (key: ProjectSortField) => 'ascend' | 'descend' | null, verticalName: (code: string | null) => string | null): ListColumn<ProjectSummary>[] {
  const sort = (key: ProjectSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key) });
  return [
    {
      card: 'title',
      cardText: (p) => p.name,
      title: 'Project',
      ...sort('name'),
      locked: true,
      width: 290,
      render: (_, p) => (
        <div>
          <Link href={`/projects/${p.id}`} className="link-strong">
            {p.name}
          </Link>
          <Sub>{[p.code, p.clientName, p.location].filter(Boolean).join(' · ')}</Sub>
        </div>
      ),
    },
    { card: 'meta', cardText: (p) => [p.code, p.clientName, p.location].filter(Boolean).join(' · '), title: 'Type', dataIndex: 'type', width: 150, defaultFrom: 1600, render: (t, p) => <ProjectTypeTag type={t} name={p.typeName} />, ...sort('type') },
    { key: 'verticalCode', title: 'Vertical', label: 'Vertical', dataIndex: 'verticalCode', width: 130, defaultFrom: 1600, render: (v: string | null) => verticalName(v) ?? <Sub>None</Sub> },
    { card: 'status', title: 'Status', dataIndex: 'status', width: 110, render: (s) => <ProjectStatusTag status={s} />, ...sort('status') },
    { key: 'projectManagerName', title: 'PM', label: 'Project manager', dataIndex: 'projectManagerName', width: 140, defaultFrom: 1400, render: (v) => v ?? <Sub>Unassigned</Sub> },
    {
      card: 'amount',
      title: 'Contract value',
      label: 'Contract value',
      dataIndex: 'contractValue',
      width: 150,
      align: 'right',
      className: 'mono',
      render: (v) => (v ? formatINR(v) : '-'),
      ...sort('contractValue'),
      total: (rows) => formatINR(rows.reduce((n, r) => n + toNumber(r.contractValue), 0)),
    },
    { key: 'physicalProgressPct', title: 'Progress', dataIndex: 'physicalProgressPct', width: 160, render: (v: number) => <Progress percent={Math.round(v * 10) / 10} size="small" status={progressStatus(v)} aria-label={`${Math.round(v * 10) / 10}% done`} /> },
    { title: 'Start date', label: 'Start date', dataIndex: 'startDate', width: 120, defaultHidden: true, render: (v) => formatDate(v), ...sort('startDate') },
    { card: 'date', title: 'End date', label: 'End date', dataIndex: 'endDate', width: 120, render: (v) => formatDate(v), ...sort('endDate') },
    {
      key: 'pendingApprovals',
      title: 'Pending',
      label: 'Pending approvals',
      dataIndex: 'pendingApprovals',
      width: 80,
      align: 'center',
      fixed: 'right',
      render: (v: number) => (v > 0 ? <Badge count={v} color={BRAND.colors.pending} /> : <Sub>0</Sub>),
    },
  ];
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  // The header's vertical (item 167) narrows the list; the filter here is the same choice.
  const [vertical, setVertical] = useVerticalScope();
  const { data: verticals } = useMasterList('vertical', false, !!user && !isGuest(user.roleKey));
  const verticalName = (code: string | null) => (code ? (verticals?.entries.find((e) => e.code === code)?.name ?? code) : null);
  const frame = useListFrame<ProjectSortField, ProjectSummary>({
    list: 'projects',
    keys: KEYS,
    // Where the sidebar's hover fetched it ahead from (LIST_START).
    sortBy: LIST_START['/projects'].sortBy,
    sortOrder: LIST_START['/projects'].sortOrder,
    sortFields: LIST_SORT_FIELDS.projects,
    projectScoped: false,
    columns: (sortOrderFor) => projectColumns(sortOrderFor, verticalName),
    moreViews: [
      { key: 'active', label: 'Active', filters: { status: 'ACTIVE' } },
      { key: 'planned', label: 'Planned', filters: { status: 'PLANNED' } },
      { key: 'on-hold', label: 'On hold', filters: { status: 'ON_HOLD' } },
      { key: 'completed', label: 'Completed', filters: { status: 'COMPLETED' } },
    ],
    statusLabels: PROJECT_STATUS_LABELS,
    chipLabels: { type: (v) => `Type: ${PROJECT_TYPE_LABELS[v as ProjectType] ?? v}` },
  });
  const { page } = frame;
  const status = page.filters.status as ProjectStatus | undefined;
  const type = page.filters.type as ProjectType | undefined;
  const filters = { ...page.params, mine: undefined, from: undefined, to: undefined, status, type, vertical };
  const { data, isLoading, isFetching, error, refetch } = useProjectsPage(filters);
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';
  const filtered = !!(type || status || vertical || page.params.q);
  const exportRows = async () => {
    const rows = await fetchAllPages<ProjectSummary>('/projects', filters);
    await downloadXlsx(exportFileName('projects'), 'Projects', PROJECT_EXPORT, rows);
    return rows.length;
  };

  const newButton = canCreate ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
      New project
    </Button>
  ) : undefined;

  return (
    <div className="page-container">
      <PageHeader
        title="Projects"
        subtitle={`${data?.total ?? 0} project${data?.total === 1 ? '' : 's'} ${filtered ? 'match' : 'in your scope'}`}
        extra={newButton}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        {frame.views}
        <ListToolbar filters={frame.filterState}
          projectId={undefined}
          onProject={() => undefined}
          hideProject
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search by name, code, client, location"
          searchLabel="Search projects"
          extra={<ExportButton onExport={exportRows} />}
        >
          <Select<ProjectType>
            allowClear
            placeholder="All types"
            aria-label="Type"
            value={type}
            onChange={(v) => page.setFilter('type', v)}
            style={{ width: 180 }}
            options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
          />
          {verticals && (
            <Select<string>
              allowClear
              placeholder="All verticals"
              aria-label="Vertical"
              value={vertical}
              onChange={(v) => setVertical(v)}
              style={{ width: 170 }}
              options={[...verticals.entries.filter((e) => e.isActive || e.code === vertical).map((e) => ({ value: e.code, label: e.name })), { value: NO_VERTICAL, label: 'No vertical' }]}
            />
          )}
          <Select<ProjectStatus>
            allowClear
            placeholder="All statuses"
            aria-label="Status"
            value={status}
            onChange={(v) => page.setFilter('status', v)}
            style={{ width: 160 }}
            options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }))}
          />
        </ListToolbar>
        <DataTable<ProjectSummary>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={data?.items ?? []}
          loading={isLoading || isFetching}
          table={page.tableProps<ProjectSummary>(data?.total)}
          onOpen={(id) => router.push(`/projects/${id}`)}
          bulk={[exportSelected<ProjectSummary>('projects', 'Projects', PROJECT_EXPORT)]}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          scrollX={1150}
          emptyText={<EmptyArt art="projects" title={filtered ? 'No project matches these filters' : 'No projects yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <ProjectFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={(id) => router.push(`/projects/${id}`)} />
    </div>
  );
}
