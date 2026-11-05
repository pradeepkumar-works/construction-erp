'use client';

import React from 'react';
import { Card, Select } from 'antd';
import Link from 'next/link';
import { tk } from '@/ds';
import type { AuditLogEntryDto, AuditLogSortField, SubmissionType } from '@erp/shared';
import { LIST_SORT_FIELDS, SUBMISSION_TYPES, auditActionLabel, auditKindLabel, canViewAuditLog } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useAuditLog } from '@/lib/queries';
import { formatDateTime, NO_VALUE } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { AUDIT_LOG_EXPORT } from '@/lib/exportColumns';
import { ExportButton } from '@/components/common/ExportButton';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { NoAccess } from '@/components/common/NoAccess';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ListToolbar } from '@/components/common/ListToolbar';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { recordPage } from '@/components/approvals/queue';

const KEYS = ['kind', 'from', 'to'] as const;

/** A submission's line opens its record; other kinds have no single page to open. */
const linkOf = (r: AuditLogEntryDto) => ((SUBMISSION_TYPES as readonly string[]).includes(r.entityType) ? recordPage(r.entityType as SubmissionType, r.entityId) : null);

export default function AuditLogPage() {
  const { user } = useAuth();
  const frame = useListFrame<AuditLogSortField, AuditLogEntryDto>({
    list: 'audit-log',
    keys: KEYS,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.auditLog,
    projectScoped: false,
    allLabel: 'Everything',
    moreViews: [{ key: 'company', label: 'Company data', filters: { kind: 'COMPANY' } }],
    chipLabels: { kind: (v) => `Kind: ${auditKindLabel(v)}` },
    columns: (sortOrderFor): ListColumn<AuditLogEntryDto>[] => {
      const sort = (key: AuditLogSortField) => ({ key, sorter: true, sortOrder: sortOrderFor(key) });
      return [
        { title: 'When', dataIndex: 'createdAt', locked: true, card: 'date', width: 170, ...sort('createdAt'), render: (v: string) => <span translate="no">{formatDateTime(v)}</span> },
        { title: 'Who', dataIndex: 'actorName', card: 'meta', width: 200, ...sort('actor'), render: (v: string) => <span translate="no">{v}</span> },
        { title: 'Kind', dataIndex: 'entityType', card: 'meta', width: 190, ...sort('kind'), render: (v: string) => auditKindLabel(v) },
        { title: 'Action', dataIndex: 'action', card: 'title', width: 190, ...sort('action'), render: (v: string) => auditActionLabel(v) },
        {
          key: 'note',
          title: 'Note',
          dataIndex: 'note',
          render: (v: string | null) => (v ? v : <span style={{ color: tk.color.text.muted }}>{NO_VALUE}</span>),
        },
        {
          key: 'open',
          title: '',
          label: 'Record',
          card: false,
          width: 90,
          render: (_: unknown, r) => {
            const href = linkOf(r);
            return href ? (
              <Link href={href} onClick={(e) => e.stopPropagation()} aria-label={`Open the ${auditKindLabel(r.entityType).toLowerCase()}`}>
                Open
              </Link>
            ) : null;
          },
        },
      ];
    },
  });
  const { page } = frame;
  const kind = page.filters.kind;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, kind, from: page.filters.from, to: page.filters.to };
  const { data, isLoading, isFetching, error, refetch } = useAuditLog(filters);
  const rows = data?.items ?? [];
  const exportRows = async () => {
    const all = await fetchAllPages<AuditLogEntryDto>('/audit-log', filters);
    await downloadXlsx(exportFileName('audit-log'), 'Audit log', AUDIT_LOG_EXPORT, all);
    return all.length;
  };

  if (user && !canViewAuditLog(user.roleKey)) {
    return (
      <div className="page-container">
        <NoAccess title="Only an admin reads the audit log" />
      </div>
    );
  }

  const filtered = !!(kind || page.filters.from || page.filters.to || page.params.q);
  return (
    <div className="page-container">
      <PageHeader title="Audit log" subtitle={`${data?.total ?? 0} ${data?.total === 1 ? 'line' : 'lines'}${filtered ? ' match' : ' across every module, newest first'}`} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Card size="small">
        {frame.views}
        <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search notes, actions, people" searchLabel="Search the audit log" extra={<ExportButton onExport={exportRows} />}>
          <Select<string>
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Every kind"
            aria-label="Kind"
            value={kind}
            onChange={(v) => page.setFilter('kind', v)}
            style={{ width: 220 }}
            options={(data?.kinds ?? []).map((k) => ({ value: k, label: auditKindLabel(k) }))}
          />
          <DateRangeFilter from={frame.dateRange.from} to={frame.dateRange.to} onChange={frame.dateRange.onChange} />
        </ListToolbar>
        <DataTable<AuditLogEntryDto>
          columns={frame.columns}
          visible={frame.choice.visible}
          onChooseColumns={frame.choice.setChosen}
          chosenIsDefault={frame.choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={page.tableProps<AuditLogEntryDto>(data?.total)}
          bulk={[exportSelected<AuditLogEntryDto>('audit-log', 'Audit log', AUDIT_LOG_EXPORT)]}
          chips={frame.chips}
          empty={frame.empty}
          failed={!!error}
          emptyText={<EmptyArt art="entries" title={filtered ? 'No line matches these filters' : 'Nothing logged yet'} />}
        />
      </Card>
    </div>
  );
}
