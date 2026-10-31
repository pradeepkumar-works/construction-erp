'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Checkbox, Select } from 'antd';
import type { DebitNoteDto, DebitNoteReason, DebitNoteSortField } from '@erp/shared';
import { DEBIT_NOTE_REASONS, DEBIT_NOTE_REASON_LABELS, LIST_SORT_FIELDS } from '@erp/shared';
import { useDebitNotes } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { DEBIT_NOTE_EXPORT } from '@/lib/exportColumns';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { RecordLink } from '@/components/record/RecordLink';
import { DebitNoteDrawer, DebitNoteTag, debitNoteBillHref } from './DebitNoteRecord';

const NO_KEYS: string[] = [];

/**
 * Debit notes in the Payables page's tab: what vendors and subcontractors owe back, taken off their bills.
 * A note is raised from its bill (or a GRN rejected or returned), so the list has no New button.
 */
export function DebitNoteList({ projectId, vendorId }: { projectId?: string; vendorId?: string }) {
  const page = useListPage<DebitNoteSortField>({ keys: NO_KEYS, sortBy: 'noteNo', sortOrder: 'desc', sortFields: LIST_SORT_FIELDS.debitNotes, url: false, scope: `${projectId}:${vendorId}` });
  const [reason, setReason] = useState<DebitNoteReason | undefined>();
  const [cancelled, setCancelled] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const filters = {
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    projectId,
    vendorId,
    reason,
    includeCancelled: cancelled || undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useDebitNotes(filters);
  const sort = (key: DebitNoteSortField) => ({ key, sorter: true, sortOrder: page.sortOrderFor(key), sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[] });
  const exportRows = async () => {
    const all = await fetchAllPages<DebitNoteDto>('/debit-notes', { ...filters });
    await downloadXlsx(exportFileName('debit-notes'), 'Debit notes', DEBIT_NOTE_EXPORT, all);
    return all.length;
  };

  const columns: ListColumn<DebitNoteDto>[] = [
    {
      title: 'Debit note',
      locked: true,
      card: 'title',
      cardText: (r) => r.noteNo,
      width: 160,
      ...sort('noteNo'),
      render: (_, r) => (
        <div>
          <RecordLink href={`/debit-notes/${r.id}`} onOpen={() => setOpened(r.id)} strong className="mono">
            {r.noteNo}
          </RecordLink>
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {DEBIT_NOTE_REASON_LABELS[r.reason]}
          </div>
        </div>
      ),
    },
    { title: 'Date', dataIndex: 'date', card: 'date', width: 120, ...sort('date'), render: (v) => formatDate(v) },
    {
      key: 'bill',
      title: 'Against',
      width: 220,
      card: 'meta',
      cardText: (r) => `${r.vendorName} · ${r.billLabel}`,
      render: (_, r) => (
        <Link href={debitNoteBillHref(r)} className="mono" translate="no">
          {r.billLabel}
        </Link>
      ),
    },
    {
      title: 'Vendor',
      width: 280,
      ...sort('vendor'),
      render: (_, r) => (
        <div>
          {r.vendorName}
          <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {r.projectCode} · {r.projectName}
          </div>
        </div>
      ),
    },
    {
      card: 'amount',
      title: 'Total',
      dataIndex: 'total',
      width: 140,
      align: 'right',
      ...sort('total'),
      render: (v) => (
        <strong className="mono" translate="no">
          {formatINR(v)}
        </strong>
      ),
      total: (all) => formatINR(all.filter((r) => !r.cancelledAt).reduce((n, r) => n + toNumber(r.total), 0)),
    },
    { key: 'state', title: 'State', width: 160, render: (_, r) => <DebitNoteTag note={r} /> },
    { key: 'createdByName', title: 'Raised by', dataIndex: 'createdByName', width: 150, defaultHidden: true },
  ];
  const choice = useColumnChoice('payables-debit-notes', columns);
  const filtered = !!page.params.q || !!reason || cancelled;
  const clear = () => (page.clear(), setReason(undefined), setCancelled(false));

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectId}
        onProject={() => undefined}
        hideProject
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search note, bill, vendor"
        searchLabel="Search debit notes"
        filters={{ count: (reason ? 1 : 0) + (cancelled ? 1 : 0), clear: () => (setReason(undefined), setCancelled(false)) }}
        extra={<ExportButton onExport={exportRows} />}
      >
        <Select
          allowClear
          placeholder="Any reason"
          aria-label="Reason"
          value={reason}
          onChange={(v) => setReason(v)}
          style={{ width: 200 }}
          options={DEBIT_NOTE_REASONS.map((r) => ({ value: r, label: DEBIT_NOTE_REASON_LABELS[r] }))}
        />
        <Checkbox checked={cancelled} onChange={(e) => setCancelled(e.target.checked)}>
          Cancelled too
        </Checkbox>
      </ListToolbar>
      <DataTable<DebitNoteDto>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<DebitNoteDto>(data?.total)}
        onOpen={(id) => setOpened(id)}
        bulk={[exportSelected<DebitNoteDto>('debit-notes', 'Debit notes', DEBIT_NOTE_EXPORT)]}
        scrollX={1200}
        empty={{ filtered, clear }}
        emptyText={<EmptyArt art="entries" title={filtered ? 'No debit note matches these filters' : 'No debit notes yet. Raise one from an approved bill.'} />}
      />
      <DebitNoteDrawer id={opened} open={!!opened} onClose={() => setOpened(null)} />
    </>
  );
}
