'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Typography } from 'antd';
import type { ReceiptWait, StockEntryDto, StockEntrySortField } from '@erp/shared';
import { LIST_SORT_FIELDS, RECEIPT_BILL_WITHIN_DAYS, RECEIPT_CHECK_WITHIN_DAYS, canCheckGrn, canRaiseDebitNote, canRecordVendorBill } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useWaitingReceipts } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { DebitNoteFormModal } from '@/components/payables/DebitNoteFormModal';
import { VendorBillForm } from '@/components/purchasing/VendorBillFormModal';
import { StockEntryDrawer, debitNoteFrom } from './StockEntryDrawer';
import { GrnQcModal } from './GrnQc';
import { StockTypeTag } from './StockTypeTag';

/** What each queue is, in its own words. */
const WORDS: Record<ReceiptWait, { search: string; empty: string; intro: string; action: string }> = {
  CHECK: {
    search: 'Search material to check',
    empty: 'Nothing to check. Every receipt is accepted or rejected.',
    intro: `Goods received at the sites in the last ${RECEIPT_CHECK_WITHIN_DAYS} days that nobody has accepted or rejected yet, oldest first. Check each lot before it goes into the work; what you reject goes to accounts for a debit note.`,
    action: 'Check',
  },
  BILL: {
    search: 'Search goods received',
    empty: "Nothing waiting. Every receipt against an order has the supplier's bill.",
    intro: `Goods received against an order in the last ${RECEIPT_BILL_WITHIN_DAYS} days whose order has no supplier bill yet, oldest first. Record the bill when it comes; it starts from what was received at the order's rates.`,
    action: 'Record bill',
  },
  DEBIT_NOTE: {
    search: 'Search rejected and returned material',
    empty: 'Nothing to raise. Every rejection and return has its debit note.',
    intro: "Material QA/QC rejected or the store sent back to the supplier, with no debit note yet. The note takes it off the supplier's bill.",
    action: 'Raise debit note',
  },
};

/**
 * A desk's queue of receipts after the store (`RECEIPT_WAITS`, the API's `waiting`): QA/QC's material to check on the
 * Quality page, accounts' goods received with no bill on Vendor bills, and debit notes to raise on Payables. Each row
 * has the step that clears it, so nobody goes into the store register to find them.
 */
export function WaitingReceipts({ waiting, projectId: fixedProject }: { waiting: ReceiptWait; projectId?: string }) {
  const { user } = useAuth();
  const [opened, setOpened] = useState<string | null>(null);
  const [checking, setChecking] = useState<StockEntryDto | null>(null);
  const [billing, setBilling] = useState<string | null>(null);
  const [debiting, setDebiting] = useState<StockEntryDto | null>(null);
  const role = user?.roleKey;
  const mayAct = !!role && (waiting === 'CHECK' ? canCheckGrn(role) : waiting === 'BILL' ? canRecordVendorBill(role) : canRaiseDebitNote(role));
  const words = WORDS[waiting];
  const act = (r: StockEntryDto) => {
    if (waiting === 'CHECK') setChecking(r);
    else if (waiting === 'BILL' && r.purchaseOrderId) setBilling(r.purchaseOrderId);
    else setDebiting(r);
  };
  const frame = useListFrame<StockEntrySortField, StockEntryDto>({
    list: `waiting-${waiting.toLowerCase()}`,
    url: false,
    keys: [],
    sortBy: 'date',
    sortOrder: 'asc',
    sortFields: LIST_SORT_FIELDS.stockEntries,
    fixedProject,
    columns: (sortOrderFor): ListColumn<StockEntryDto>[] => [
      { key: 'date', card: 'date', title: 'Received', dataIndex: 'date', width: 120, sorter: true, sortOrder: sortOrderFor('date'), render: (v) => formatDate(v) },
      {
        key: 'entryNo',
        card: 'title',
        title: 'Entry',
        dataIndex: 'entryNo',
        locked: true,
        width: 150,
        render: (v, r) => (
          <div>
            <RecordLink onOpen={() => setOpened(r.id)} className="mono">
              {v}
            </RecordLink>
            {waiting === 'DEBIT_NOTE' ? <div><StockTypeTag type={r.type} /></div> : null}
          </div>
        ),
      },
      ...(fixedProject
        ? []
        : [{ key: 'project', card: 'meta' as const, cardText: (r: StockEntryDto) => r.projectName, title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: StockEntryDto) => <Link href={`/projects/${r.projectId}`}>{v}</Link> }]),
      {
        key: 'from',
        card: 'meta',
        cardText: (r) => r.supplier ?? '-',
        title: 'Supplier',
        width: 220,
        render: (_, r) => (
          <div>
            <span translate="no">{r.supplier ?? '-'}</span>
            {r.poNo ? (
              <div className="text-muted mono" style={{ fontSize: 12 }}>
                <Link href={`/purchase-orders/${r.purchaseOrderId}`}>{r.poNo}</Link>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'items',
        title: waiting === 'DEBIT_NOTE' ? 'Rejected or returned' : 'Items',
        render: (_, r) => {
          const lines = r.lines
            .map((l) => ({ l, q: waiting === 'DEBIT_NOTE' ? (r.type === 'RETURN_TO_VENDOR' ? Math.abs(Number(l.quantity)) : Number(l.rejectedQty ?? 0)) : Number(l.quantity) }))
            .filter((x) => x.q > 0);
          return (
            <span>
              {lines.slice(0, 3).map(({ l, q }, i) => (
                <span key={l.id}>
                  {i > 0 ? ', ' : ''}
                  {l.itemName} <span translate="no">{formatQty(q)} {l.unit}</span>
                </span>
              ))}
              {lines.length > 3 ? <Typography.Text type="secondary">{` and ${lines.length - 3} more`}</Typography.Text> : null}
              {waiting === 'DEBIT_NOTE' && r.qcNote ? <div className="text-muted" style={{ fontSize: 12 }}>{r.qcNote}</div> : null}
            </span>
          );
        },
      },
      { key: 'by', title: 'Received by', dataIndex: 'createdByName', width: 150, defaultFrom: 1400 },
      ...(mayAct
        ? [
            {
              key: 'act',
              title: '',
              label: 'Action',
              locked: true,
              width: 150,
              render: (_: unknown, r: StockEntryDto) => (
                <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); act(r); }}>
                  {words.action}
                </Button>
              ),
            },
          ]
        : []),
    ],
  });
  const { page } = frame;
  const { data, isLoading, isFetching, error, refetch } = useWaitingReceipts(waiting, { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortBy: page.params.sortBy, sortOrder: page.params.sortOrder, projectId: frame.projectId });

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
        {words.intro}
      </Typography.Paragraph>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState} projectId={frame.projectFilter} onProject={frame.setProjectFilter} hideProject={!!fixedProject} search={page.search} onSearch={page.setSearch} searchPlaceholder="Entry, supplier, item" searchLabel={words.search} />
      <DataTable<StockEntryDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<StockEntryDto>(data?.total)}
        onOpen={setOpened}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1000 : 1200}
        emptyText={<EmptyArt art="approved" title={words.empty} />}
      />
      <StockEntryDrawer id={opened} onClose={() => setOpened(null)} />
      {checking ? <GrnQcModal entry={checking} open={!!checking} onClose={() => setChecking(null)} /> : null}
      <VendorBillForm open={!!billing} purchaseOrderId={billing ?? undefined} onClose={() => setBilling(null)} />
      <DebitNoteFormModal open={!!debiting} grn={debiting ? debitNoteFrom(debiting) : null} onClose={() => setDebiting(null)} />
    </>
  );
}
