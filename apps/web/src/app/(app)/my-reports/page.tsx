'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card } from 'antd';
import { canBuildReports, type SavedReportDto } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { useDeleteReport, useSavedReportsPage } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate, NO_VALUE } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { NoAccess } from '@/components/common/NoAccess';
import { PlusOutlined } from '@/components/common/icons';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { MoreActions } from '@/components/record/MoreActions';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { ReportForm } from '@/components/report-builder/ReportForm';

type SortField = 'name' | 'updatedAt';
const KEYS = ['mine', 'scheduled'] as const;
const crumbs = [{ title: 'Reports', href: '/modules/reports' }];

/** Reports › My reports (ARCHITECTURE "Reports you build"): the reports the user saved and those shared with them. */
export default function MyReportsPage() {
  const { user } = useAuth();
  if (user && !canBuildReports(user.roleKey))
    return (
      <div className="page-container">
        <PageHeader title="My reports" crumbs={crumbs} />
        <NoAccess title="Reports you build are for roles that see orders, bills, indents, stock, vendors or projects" />
      </div>
    );
  return <MyReports />;
}

function MyReports() {
  const router = useRouter();
  const [editing, setEditing] = useState<SavedReportDto | null>(null);
  const [adding, setAdding] = useState(false);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useDeleteReport();
  useNewIntent('report', true, () => setAdding(true));

  const frame = useListFrame<SortField, SavedReportDto>({
    list: 'my-reports',
    keys: KEYS,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    sortFields: ['name', 'updatedAt'],
    projectScoped: false,
    moreViews: [
      { key: 'mine', label: 'Mine', filters: { mine: '1' } },
      { key: 'scheduled', label: 'Emailed on a schedule', filters: { scheduled: '1' } },
    ],
    chipLabels: { mine: () => 'Mine', scheduled: () => 'Emailed on a schedule' },
    columns: (sortOrderFor): ListColumn<SavedReportDto>[] => [
      {
        key: 'name',
        title: 'Report',
        locked: true,
        sorter: true,
        sortOrder: sortOrderFor('name'),
        render: (_, r) => (
          <div>
            <Link href={`/my-reports/${r.id}`} style={{ fontWeight: tk.type.strong.fontWeight }}>
              {r.name}
            </Link>
            <div style={{ fontSize: tk.type.caption.fontSize, color: tk.color.text.muted }}>{r.sourceLabel}</div>
          </div>
        ),
      },
      { key: 'schedule', title: 'Emailed', render: (_, r) => (r.schedule ? `${r.schedule.words}, to ${r.schedule.recipients.length === 1 ? r.schedule.recipients[0].name : `${r.schedule.recipients.length} people`}` : NO_VALUE) },
      { key: 'owner', title: 'Made by', width: 180, render: (_, r) => (r.mine ? 'You' : <span translate="no">{r.ownerName}</span>) },
      { key: 'shared', title: 'Shared', width: 110, defaultFrom: 900, render: (_, r) => (r.shared ? 'Shared' : 'Only you') },
      { key: 'updatedAt', title: 'Changed', label: 'Changed on', width: 130, sorter: true, sortOrder: sortOrderFor('updatedAt'), render: (_, r) => formatDate(r.updatedAt) },
      {
        key: 'actions',
        title: '',
        label: 'Actions',
        locked: true,
        width: 64,
        render: (_, r) => (
          <MoreActions
            inRow
            label={`Actions for ${r.name}`}
            items={[
              { key: 'open', label: 'Open', onSelect: () => router.push(`/my-reports/${r.id}`) },
              ...(r.mine
                ? [
                    { key: 'edit', label: 'Edit', onSelect: () => setEditing(r) },
                    { key: 'delete', label: 'Delete', danger: true, onSelect: () => askDelete({ what: `report ${r.name}`, onConfirm: () => remove.mutateAsync(r.id) }) },
                  ]
                : []),
            ]}
          />
        ),
      },
    ],
  });
  const { page } = frame;
  const mine = page.filters.mine === '1';
  const scheduled = page.filters.scheduled === '1';
  const { data, isLoading, isFetching, error, refetch } = useSavedReportsPage({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, mine: mine || undefined, scheduled: scheduled || undefined });
  const rows = data?.items ?? [];

  const newButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New report
    </Button>
  );

  return (
    <div className="page-container">
      <PageHeader title="My reports" crumbs={crumbs} help="Tables you build from orders, bills, indents, stock, vendors and projects: the columns, conditions, groups and totals you choose, saved, printed, sent to Excel and emailed on a schedule. Everyone sees a report with their own access." extra={newButton} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        {frame.views}
        <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search by name" searchLabel="Search reports" />
        <DataTable<SavedReportDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={page.tableProps<SavedReportDto>(data?.total)}
          onOpen={(id) => router.push(`/my-reports/${id}`)}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title={page.params.q || mine || scheduled ? 'No report matches these filters' : 'No reports yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <ReportForm open={adding || !!editing} report={editing} onClose={() => (setAdding(false), setEditing(null))} />
      {deleteDialog}
    </div>
  );
}
