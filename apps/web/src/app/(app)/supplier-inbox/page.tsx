'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Descriptions, Drawer, Flex, Segmented, Table, Typography } from 'antd';
import { AppTabs } from '@/components/common/AppTabs';
import { useQueryClient } from '@tanstack/react-query';
import {
  SUPPLIER_INVOICE_STAGE_LABELS,
  canApproveSupplierChange,
  canCheckSupplierInvoices,
  canManageSupplierLogins,
  canPrepareSubcontractBill,
  canRecordVendorBill,
  type SupplierChangeDto,
  type SupplierInvoiceDto,
  type SupplierInvoiceStage,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSupplierChanges, useSupplierInbox, useSupplierInboxInvoice } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery, PhotoThumbs } from '@/components/common/AttachmentGallery';
import { RecordLink } from '@/components/record/RecordLink';
import { VendorBillFormModal } from '@/components/purchasing/VendorBillFormModal';
import { OtherBillFormModal } from '@/components/purchasing/OtherBillFormModal';
import { SubBillFormModal } from '@/components/subcontracts/SubBillFormModal';
import { ChangeList } from '@/components/supplier/ChangeList';
import { DecideChangeForm, ReturnInvoiceForm } from '@/components/supplier/StaffForms';
import { InvoiceStageTag, Money } from '@/components/supplier/supplierUi';

type StageFilter = SupplierInvoiceStage | 'ALL';
const STAGE_FILTERS: StageFilter[] = ['SUBMITTED', 'BILLED', 'PAID', 'RETURNED', 'WITHDRAWN', 'ALL'];
const billHref = (b: NonNullable<SupplierInvoiceDto['bill']>) => (b.kind === 'VENDOR_BILL' ? `/vendor-bills/${b.id}` : `/subcontract-bills/${b.id}`);

/**
 * What suppliers sent in through their portal (v6 item 105): invoices for accounts to record as bills or return, and
 * changes to their details to approve. Bank changes go only to those who pay.
 */
export default function SupplierInboxPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const invoicesOn = !!user && canCheckSupplierInvoices(user.roleKey);
  const changesOn = !!user && canManageSupplierLogins(user.roleKey);
  const tab = search.get('tab') === 'changes' || !invoicesOn ? 'changes' : 'invoices';
  const changes = useSupplierChanges(changesOn);
  const setParams = (p: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(p)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return (
    <div className="page-container">
      <PageHeader title="Supplier inbox" subtitle="Invoices suppliers sent through their portal, and changes they asked for to their details." />
      <AppTabs
        activeKey={tab}
        onChange={(k) => setParams({ tab: k === 'invoices' ? null : k, id: null })}
        items={[
          ...(invoicesOn ? [{ key: 'invoices', label: 'Invoices', children: <Invoices openId={search.get('id')} setOpen={(id) => setParams({ id })} /> }] : []),
          ...(changesOn
            ? [{ key: 'changes', label: 'Changes to details', count: changes.data?.length, countLabel: 'waiting', attention: true, children: <Changes list={changes} /> }]
            : []),
        ]}
      />
    </div>
  );
}

function Invoices({ openId, setOpen }: { openId: string | null; setOpen: (id: string | null) => void }) {
  const [stage, setStage] = useState<StageFilter>('SUBMITTED');
  const { data, isFetching, isLoading, error, refetch } = useSupplierInbox(stage === 'ALL' ? { all: true } : { stage });
  return (
    <>
      <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
        <Segmented<StageFilter>
          value={stage}
          onChange={setStage}
          aria-label="Show invoices"
          options={STAGE_FILTERS.map((s) => ({ value: s, label: s === 'ALL' ? 'All' : s === 'SUBMITTED' ? 'Waiting' : SUPPLIER_INVOICE_STAGE_LABELS[s] }))}
        />
      </Flex>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<SupplierInvoiceDto>
        rowKey="id"
        size="small"
        loading={isLoading || isFetching}
        dataSource={data ?? []}
        locale={{ emptyText: stage === 'SUBMITTED' ? 'No invoices waiting. Suppliers send them from their portal.' : 'No invoices here' }}
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        onRow={(i) => ({ onClick: () => setOpen(i.id), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Invoice',
            dataIndex: 'invoiceNo',
            width: 160,
            render: (v: string, i) => (
              <RecordLink href={`/supplier-inbox?id=${i.id}`} onOpen={() => setOpen(i.id)} strong>
                <span translate="no">{v}</span>
              </RecordLink>
            ),
          },
          { title: 'Supplier', dataIndex: 'vendorName', render: (v: string) => <span translate="no">{v}</span> },
          { title: 'Date', dataIndex: 'invoiceDate', width: 110, render: (v: string) => formatDate(v) },
          { title: 'Against', key: 'against', width: 150, render: (_, i) => <span translate="no">{i.poNo ?? i.woNo ?? i.projectName ?? '-'}</span> },
          { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v: string) => <Money value={v} /> },
          { title: 'File', key: 'file', width: 100, render: (_, i) => <PhotoThumbs attachments={i.attachments} /> },
          { title: 'Sent', dataIndex: 'createdAt', width: 150, render: (v: string, i) => <span>{formatDateTime(v)}<br /><Typography.Text type="secondary">{i.sentBy}</Typography.Text></span> },
          {
            title: 'Status',
            key: 'stage',
            width: 180,
            render: (_, i) => (
              <span>
                <InvoiceStageTag stage={i.stage} />
                {i.bill ? <span translate="no">{i.bill.billNo}</span> : null}
              </span>
            ),
          },
        ]}
      />
      <InvoiceDrawer id={openId} onClose={() => setOpen(null)} />
    </>
  );
}

function InvoiceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: i, error, refetch } = useSupplierInboxInvoice(id);
  const [returning, setReturning] = useState<SupplierInvoiceDto | null>(null);
  const [recording, setRecording] = useState<SupplierInvoiceDto | null>(null);
  const waiting = i?.stage === 'SUBMITTED';
  const canBill = !!user && canRecordVendorBill(user.roleKey);
  const canSubBill = !!user && canPrepareSubcontractBill(user.roleKey);
  const recordWith = recording?.workOrderId ? 'WO' : recording?.purchaseOrderId ? 'PO' : recording ? 'OTHER' : null;
  const otherStart = useMemo(
    () =>
      recording && !recording.workOrderId && !recording.purchaseOrderId
        ? { projectId: recording.projectId ?? undefined, vendorId: recording.vendorId, invoiceNo: recording.invoiceNo, invoiceDate: recording.invoiceDate, amount: recording.amount, gstAmount: recording.gstAmount, notes: recording.notes }
        : undefined,
    [recording],
  );
  const saved = () => void qc.invalidateQueries({ queryKey: ['supplier-portal'] });
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={760}
      title={i ? `Invoice ${i.invoiceNo} from ${i.vendorName}` : 'Supplier invoice'}
      extra={
        i && waiting ? (
          <Flex gap={8} wrap>
            {i.workOrderId ? (
              canSubBill ? (
                <Button type="primary" onClick={() => setRecording(i)}>
                  New subcontractor bill
                </Button>
              ) : null
            ) : canBill ? (
              <Button type="primary" onClick={() => setRecording(i)}>
                Record vendor bill
              </Button>
            ) : null}
            <Button onClick={() => setReturning(i)}>Return</Button>
          </Flex>
        ) : null
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {i ? (
        <>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Status" span={2}>
              <InvoiceStageTag stage={i.stage} />
              {i.bill ? (
                <Link href={billHref(i.bill)} translate="no">
                  {i.bill.billNo}
                </Link>
              ) : null}
              {i.returnNote && i.stage === 'RETURNED' ? <div>{i.returnNote}</div> : null}
            </Descriptions.Item>
            <Descriptions.Item label="Supplier">
              <span translate="no">{i.vendorName}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Invoice date">{formatDate(i.invoiceDate)}</Descriptions.Item>
            <Descriptions.Item label="Amount with GST">
              <Money value={i.amount} />
            </Descriptions.Item>
            <Descriptions.Item label="Of which GST">{i.gstAmount ? <Money value={i.gstAmount} /> : '-'}</Descriptions.Item>
            <Descriptions.Item label="Against">
              {i.purchaseOrderId ? (
                <Link href={`/purchase-orders/${i.purchaseOrderId}`} translate="no">
                  {i.poNo}
                </Link>
              ) : i.workOrderId ? (
                <Link href={`/work-orders/${i.workOrderId}`} translate="no">
                  {i.woNo}
                </Link>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Site">
              <span translate="no">{i.projectName ?? '-'}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Sent" span={2}>{`${formatDateTime(i.createdAt)} by ${i.sentBy}`}</Descriptions.Item>
            {i.notes ? (
              <Descriptions.Item label="Their note" span={2}>
                {i.notes}
              </Descriptions.Item>
            ) : null}
            {i.bill ? (
              <Descriptions.Item label="Paid" span={2}>
                <Money value={i.bill.paid} /> of <Money value={i.bill.payable} />
              </Descriptions.Item>
            ) : null}
          </Descriptions>
          <Typography.Title level={2} style={{ fontSize: 16 }}>
            Invoice file
          </Typography.Title>
          <AttachmentGallery attachments={i.attachments} />
          {waiting ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              {i.purchaseOrderId || i.workOrderId
                ? 'A bill with the same invoice number moves this invoice to Billed, and the supplier sees it.'
                : 'This invoice names no order, so it is recorded as a vendor bill for another service. A bill with the same invoice number moves it to Billed, and the supplier sees it.'}
            </Typography.Paragraph>
          ) : null}
        </>
      ) : null}
      <ReturnInvoiceForm invoice={returning} onClose={() => setReturning(null)} />
      <VendorBillFormModal
        open={recordWith === 'PO'}
        purchaseOrderId={recording?.purchaseOrderId ?? undefined}
        fromInvoice={recording}
        onClose={() => setRecording(null)}
        onSaved={saved}
      />
      <SubBillFormModal
        open={recordWith === 'WO'}
        workOrderId={recording?.workOrderId ?? undefined}
        fromInvoice={recording}
        onClose={() => setRecording(null)}
        onSaved={saved}
      />
      <OtherBillFormModal open={recordWith === 'OTHER'} kind="OTHER" start={otherStart} onClose={() => setRecording(null)} onSaved={saved} />
    </Drawer>
  );
}

function Changes({ list }: { list: ReturnType<typeof useSupplierChanges> }) {
  const { user } = useAuth();
  const [deciding, setDeciding] = useState<{ change: SupplierChangeDto; approve: boolean } | null>(null);
  return (
    <>
      {list.error && <QueryError error={list.error} onRetry={() => list.refetch()} />}
      <Typography.Paragraph type="secondary">
        Waiting changes. A new bank account is approved only by those who pay vendors; confirm it with the supplier on a number you already had.
      </Typography.Paragraph>
      <ChangeList
        changes={list.data ?? []}
        vendorColumn
        extra={(c) =>
          user && canApproveSupplierChange(user.roleKey, c.bank) ? (
            <Flex gap={8} wrap>
              <Button size="small" type="primary" onClick={() => setDeciding({ change: c, approve: true })} aria-label={`Approve ${c.vendorName}'s change`}>
                Approve
              </Button>
              <Button size="small" onClick={() => setDeciding({ change: c, approve: false })} aria-label={`Reject ${c.vendorName}'s change`}>
                Reject
              </Button>
            </Flex>
          ) : (
            <Typography.Text type="secondary">Accounts approve bank changes</Typography.Text>
          )
        }
      />
      <DecideChangeForm decision={deciding} onClose={() => setDeciding(null)} />
    </>
  );
}
