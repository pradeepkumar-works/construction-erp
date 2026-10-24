'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Checkbox, Select, Space, Typography, theme } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import type { RfiDto, RfiSortField, RfiStatus } from '@erp/shared';
import { LIST_SORT_FIELDS, RFI_STATUSES, RFI_STATUS_LABELS, canRaiseRfi } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRfiSummary, useRfis } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { RfiStatusTag, UrgentTag, ageText } from './rfiUi';

const KEYS = ['status', 'overdue'] as const;

const EXPORT: ExportColumn<RfiDto>[] = [
  { header: 'RFI no.', value: (r) => r.rfiNo, width: 16 },
  { header: 'Project', value: (r) => r.projectName, width: 28 },
  { header: 'Raised on', value: (r) => r.raisedOn, width: 12 },
  { header: 'Subject', value: (r) => r.subject, width: 40 },
  { header: 'Question', value: (r) => r.question, width: 60 },
  { header: 'Location', value: (r) => r.location, width: 24 },
  { header: 'Drawing', value: (r) => r.documentLabel, width: 30 },
  { header: 'Priority', value: (r) => (r.priority === 'URGENT' ? 'Urgent' : 'Normal') },
  { header: 'To', value: (r) => r.toParty, width: 28 },
  { header: 'Answer by', value: (r) => r.replyBy, width: 12 },
  { header: 'Status', value: (r) => RFI_STATUS_LABELS[r.status], width: 18 },
  { header: 'Days overdue', value: (r) => r.age.daysOverdue || null },
  { header: 'Answer', value: (r) => r.answer, width: 60 },
  { header: 'Answered on', value: (r) => r.answeredOn, width: 12 },
  { header: 'Answered by', value: (r) => r.answeredByName, width: 24 },
  { header: 'Their reference', value: (r) => r.answerRef, width: 20 },
  { header: 'Cost impact', value: (r) => (r.costImpact ? 'Yes' : '') },
  { header: 'Time impact', value: (r) => (r.timeImpact ? 'Yes' : '') },
  { header: 'Variation', value: (r) => r.variationLabel },
  { header: 'Delay / risk', value: (r) => r.riskNo },
  { header: 'Raised by', value: (r) => r.raisedByName, width: 20 },
];

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** Requests for information to the client or consultant, with the answer awaited and how late it is. */
export function RfiList({ projectId: fixedProject, onOpen, onNew }: { projectId?: string; onOpen: (id: string) => void; onNew: () => void }) {
  const { user } = useAuth();
  const frame = useListFrame<RfiSortField, RfiDto>({
    list: 'rfis',
    url: false,
    keys: KEYS,
    sortBy: 'raisedOn',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.rfis,
    fixedProject,
    chipLabels: { status: (v) => RFI_STATUS_LABELS[v as RfiStatus] ?? v, overdue: () => 'Overdue' },
    columns: (sortOrderFor): ListColumn<RfiDto>[] => {
      const sort = (key: RfiSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
      return [
        { title: 'No.', dataIndex: 'rfiNo', width: 140, className: 'mono', card: 'meta', ...sort('rfiNo') },
        { title: 'Raised', dataIndex: 'raisedOn', width: 110, render: (v) => formatDate(v), card: false, ...sort('raisedOn') },
        ...(fixedProject
          ? []
          : [{ title: 'Project', dataIndex: 'projectName', ...sort('project'), width: 200, ellipsis: true, card: 'meta', render: (v: string, r: RfiDto) => <Link href={`/projects/${r.projectId}?tab=documents&sub=rfis`}>{v}</Link> } satisfies ListColumn<RfiDto>]),
        {
          title: 'Subject',
          key: 'subject',
          locked: true,
          width: 340,
          card: 'title',
          cardText: (r) => `${r.subject}${r.priority === 'URGENT' ? ' (urgent)' : ''}`,
          render: (_, r) => (
            <div>
              <Space size={6} wrap>
                <RecordLink onOpen={() => onOpen(r.id)}>{r.subject}</RecordLink>
                <UrgentTag priority={r.priority} />
              </Space>
              <Sub>{[r.location, r.documentLabel ? r.documentLabel.split(' ')[0] : null, `to ${r.toParty}`].filter(Boolean).join(' · ')}</Sub>
            </div>
          ),
        },
        {
          title: 'Answer by',
          dataIndex: 'replyBy',
          width: 120,
          card: 'date',
          ...sort('replyBy'),
          render: (v: string, r) => <Typography.Text type={r.age.overdue ? 'danger' : r.status === 'OPEN' ? undefined : 'secondary'}>{formatDate(v)}</Typography.Text>,
        },
        {
          key: 'status',
          title: 'Status',
          dataIndex: 'status',
          width: 190,
          card: 'status',
          // The card has little room beside the title: the status alone, its age is in the record.
          cardText: (r) => <RfiStatusTag status={r.status} age={r.age} />,
          render: (s: RfiStatus, r) => (
            <div>
              <RfiStatusTag status={s} age={r.age} />
              <Sub>{ageText(s, r.age)}</Sub>
            </div>
          ),
        },
        {
          key: 'links',
          title: 'Led to',
          width: 140,
          card: false,
          render: (_, r) => [r.variationLabel, r.riskNo].filter(Boolean).join(' · ') || <Sub>-</Sub>,
        },
        { key: 'raisedByName', title: 'Raised by', dataIndex: 'raisedByName', width: 150, defaultHidden: true },
      ];
    },
  });
  const { page } = frame;
  const status = page.filters.status as RfiStatus | undefined;
  const overdue = page.filters.overdue === '1';
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId, status, overdue: overdue || undefined };
  const { data, isLoading, isFetching, error, refetch } = useRfis(filters);
  const { data: summary } = useRfiSummary(frame.projectId);
  const mayRaise = !!user && canRaiseRfi(user.roleKey);

  const newButton = mayRaise ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>
      New RFI
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {summary && (summary.open || summary.answered) ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 16px 0', fontSize: themeFontSize('fontSizeSM') }} className="text-muted">
          <span>
            <strong translate="no">{summary.open}</strong> waiting for an answer
          </span>
          {summary.overdue ? (
            <span className="text-danger">
              <strong translate="no">{summary.overdue}</strong> overdue
            </span>
          ) : null}
          {summary.answered ? (
            <span>
              <strong translate="no">{summary.answered}</strong> answered, not yet closed
            </span>
          ) : null}
          {summary.avgDaysToAnswer !== null ? <span>Answered in {summary.avgDaysToAnswer} days on average (last 90 days)</span> : null}
        </div>
      ) : null}
      <ListToolbar
        filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., subject, question, drawing"
        searchLabel="Search RFIs"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<RfiDto>('/rfis', filters);
                await downloadXlsx(exportFileName('rfis'), 'RFIs', EXPORT, rows);
                return rows.length;
              }}
            />
            {newButton}
          </>
        }
      >
        <Select<RfiStatus> allowClear placeholder="Any status" aria-label="Status" value={status} onChange={(v) => page.setFilter('status', v)} style={{ width: 180 }} options={RFI_STATUSES.map((s) => ({ value: s, label: RFI_STATUS_LABELS[s] }))} />
        <Checkbox checked={overdue} onChange={(e) => page.setFilter('overdue', e.target.checked ? '1' : undefined)}>
          Overdue
        </Checkbox>
      </ListToolbar>
      <DataTable<RfiDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RfiDto>(data?.total)}
        onOpen={onOpen}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 980 : 1180}
        emptyText={<EmptyArt art="entries" title={status || overdue || page.params.q ? 'No RFI matches these filters' : 'No RFIs raised'} />}
        emptyAction={newButton}
      />
    </>
  );
}
