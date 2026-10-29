'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Descriptions, Divider, Drawer, Skeleton, Space, Table, Typography } from 'antd';
import { DeleteOutlined, FileExcelOutlined, ImportOutlined, SafetyCertificateOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryDto, StockEntryType, StockLineDto } from '@erp/shared';
import { STOCK_ADJUSTMENT_REASON_LABELS, canAdjustStock, canCheckGrn, canKeepStock, canRaiseDebitNote } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useStockEntry } from '@/lib/queries';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { StockTypeTag } from './StockTypeTag';
import { ReceiveTransferModal } from './ReceiveTransferModal';
import { GrnQcModal, GrnQcTag } from './GrnQc';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DebitNoteFormModal, type DebitNoteGrn } from '@/components/payables/DebitNoteFormModal';

const KIND: Record<StockEntryType, string> = {
  RECEIPT: 'Goods received note',
  ISSUE: 'Issue slip',
  ADJUSTMENT: 'Stock adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  RETURN_TO_VENDOR: 'Return to supplier',
  RETURN_FROM_SITE: 'Return from site',
};

/** What a debit note starts from: a GRN's rejected quantities, or what went back to the supplier (v5 item 91). */
export function debitNoteFrom(e: StockEntryDto): DebitNoteGrn | null {
  const returned = e.type === 'RETURN_TO_VENDOR';
  const lines = e.lines
    .map((l) => ({ purchaseOrderLineId: l.purchaseOrderLineId, itemName: l.itemName, unit: l.unit, quantity: Math.abs(Number(returned ? l.quantity : (l.rejectedQty ?? 0))) }))
    .filter((l) => l.quantity > 0);
  if ((!returned && e.type !== 'RECEIPT') || !lines.length) return null;
  return { stockEntryId: e.id, entryNo: e.entryNo, projectId: e.projectId, purchaseOrderId: e.purchaseOrderId, vendorId: e.vendorId, reason: returned ? 'RETURNED' : 'REJECTED', lines };
}

/** A GRN, issue slip, adjustment, transfer or return. Approvers can delete a wrong entry; a transfer in transit can be received. */
export function StockEntryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useStockEntry(id ?? undefined);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/stock/entries/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });
  const mayDelete = !!user && canAdjustStock(user.roleKey);
  const kind = data ? KIND[data.type] : '';
  const [receiving, setReceiving] = useState(false);
  const [checking, setChecking] = useState(false);
  const mayCheck = !!data && data.type === 'RECEIPT' && !!user && canCheckGrn(user.roleKey);
  const anyRejected = !!data && data.lines.some((l) => l.rejectedQty && Number(l.rejectedQty) > 0);
  const canReceive = !!data && data.type === 'TRANSFER_OUT' && !data.transferInId && !!user && canKeepStock(user.roleKey);
  const [debiting, setDebiting] = useState(false);
  // Kept stable: the form starts again whenever what it starts from changes.
  const raiser = !!user && canRaiseDebitNote(user.roleKey);
  const debit = useMemo(() => (data && raiser ? debitNoteFrom(data) : null), [data, raiser]);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={640}
      title={data ? <Space>{`${kind} · ${data.entryNo}`}<StockTypeTag type={data.type} /></Space> : 'Stock entry'}
      extra={
        <Space>
          {mayCheck ? (
            <Button type={data!.qcStatus ? 'default' : 'primary'} size="small" icon={<SafetyCertificateOutlined />} onClick={() => setChecking(true)}>
              {data!.qcStatus ? 'Change QA/QC check' : 'QA/QC check'}
            </Button>
          ) : null}
          {debit ? (
            <Button size="small" icon={<FileExcelOutlined />} onClick={() => setDebiting(true)}>
              Raise debit note
            </Button>
          ) : null}
          {canReceive ? (
            <Button type="primary" size="small" icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
              Receive at {data!.toProjectName}
            </Button>
          ) : null}
          {data && mayDelete ? (
          <ConfirmDelete what={data.entryNo} description="Its quantities come off the stock register." onConfirm={() => remove.mutateAsync()}>
            <Button danger size="small" icon={<DeleteOutlined />} loading={remove.isPending}>
              Delete
            </Button>
          </ConfirmDelete>
          ) : null}
        </Space>
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            style={{ marginBottom: 16 }}
            items={[
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'project', label: 'Project', children: <Link href={`/projects/${data.projectId}?tab=stock`}>{data.projectName}</Link> },
              ...(data.type === 'RECEIPT'
                ? [
                    ...(data.poNo ? [{ key: 'po', label: 'Purchase order', children: data.poNo }] : []),
                    { key: 'mr', label: 'Material request', children: data.requestNo ?? '-' },
                    { key: 'supplier', label: 'Supplier', children: data.supplier ?? '-' },
                    { key: 'challan', label: 'Challan no.', children: data.challanNo ?? '-' },
                    { key: 'vehicle', label: 'Vehicle no.', children: data.vehicleNo ?? '-' },
                    {
                      key: 'qc',
                      label: 'QA/QC',
                      span: 2,
                      children: (
                        <Space wrap size={4}>
                          <GrnQcTag status={data.qcStatus} />
                          {data.qcByName ? <Typography.Text type="secondary">{`${data.qcByName}, ${formatDateTime(data.qcAt)}`}</Typography.Text> : null}
                          {data.qcNote ? <span>{data.qcNote}</span> : null}
                        </Space>
                      ),
                    },
                    ...(data.mtcNo ? [{ key: 'mtc', label: 'Test certificate', children: <span translate="no">{data.mtcDate ? `${data.mtcNo}, ${formatDate(data.mtcDate)}` : data.mtcNo}</span> }] : []),
                  ]
                : []),
              ...(data.type === 'TRANSFER_OUT'
                ? [
                    { key: 'to', label: 'Sent to', children: data.toProjectId ? <Link href={`/projects/${data.toProjectId}?tab=stock`}>{data.toProjectName}</Link> : (data.issuedTo ?? '-') },
                    { key: 'state', label: 'Received', children: data.transferInNo ? `Yes, as ${data.transferInNo}` : 'Not yet (in transit)' },
                    { key: 'challan', label: 'Challan no.', children: data.challanNo ?? '-' },
                    { key: 'vehicle', label: 'Vehicle no.', children: data.vehicleNo ?? '-' },
                  ]
                : []),
              ...(data.type === 'TRANSFER_IN'
                ? [
                    { key: 'from', label: 'From', children: data.fromProjectName ?? data.supplier ?? '-' },
                    { key: 'out', label: 'Sent as', children: data.transferOutNo ?? '-' },
                  ]
                : []),
              ...(data.type === 'RETURN_TO_VENDOR'
                ? [
                    { key: 'supplier', label: 'Supplier', children: data.supplier ?? '-' },
                    { key: 'challan', label: 'Debit note / challan', children: data.challanNo ?? '-' },
                  ]
                : []),
              ...(data.type === 'ISSUE' || data.type === 'RETURN_FROM_SITE'
                ? [
                    { key: 'to', label: data.type === 'ISSUE' ? 'Issued to' : 'Returned by', children: data.issuedTo ?? '-' },
                    ...(data.equipmentCode
                      ? [{ key: 'machine', label: 'Into machine', children: `${data.equipmentCode}${data.meterReading ? ` at meter ${formatQty(data.meterReading)}` : ''}` }]
                      : []),
                    ...(data.woNo ? [{ key: 'wo', label: 'Work order', children: `${data.woNo}${data.subcontractBillId ? ', recovered in their bill' : ', to be recovered from their next bill'}` }] : []),
                    { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
                  ]
                : []),
              ...(data.adjustmentReason ? [{ key: 'reason', label: 'Reason', children: STOCK_ADJUSTMENT_REASON_LABELS[data.adjustmentReason], span: 2 }] : []),
              {
                key: 'remarks',
                label: data.adjustmentReason ? 'Details' : data.type === 'ADJUSTMENT' || data.type === 'RETURN_TO_VENDOR' ? 'Reason' : 'Remarks',
                children: data.remarks ?? '-',
                span: 2,
              },
              { key: 'by', label: 'Entered by', children: `${data.createdByName}, ${formatDateTime(data.createdAt)}`, span: 2 },
            ]}
          />
          <Table<StockLineDto>
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.lines}
            columns={[
              { title: '#', key: 'idx', width: 40, render: (_, __, i) => i + 1 },
              { title: 'Item', dataIndex: 'itemName' },
              {
                title: 'Quantity',
                dataIndex: 'quantity',
                align: 'right',
                width: 130,
                render: (v: string) => <Typography.Text type={Number(v) < 0 ? 'danger' : 'success'}>{`${Number(v) > 0 ? '+' : ''}${formatQty(v)}`}</Typography.Text>,
              },
              { title: 'Unit', dataIndex: 'unit', width: 80 },
              ...(anyRejected
                ? [{ title: 'Rejected', dataIndex: 'rejectedQty', align: 'right' as const, width: 110, render: (v: string | null) => (v && Number(v) > 0 ? <Typography.Text type="danger">{formatQty(v)}</Typography.Text> : '-') }]
                : []),
            ]}
          />
          {data.attachments.length > 0 && (
            <>
              <Divider titlePlacement="start" plain>
                Challan / invoice
              </Divider>
              <AttachmentGallery attachments={data.attachments} />
            </>
          )}
        </>
      )}
      {data && mayCheck ? <GrnQcModal entry={data} open={checking} onClose={() => setChecking(false)} /> : null}
      {debit ? <DebitNoteFormModal open={debiting} grn={debit} onClose={() => setDebiting(false)} /> : null}
      {data && canReceive ? <ReceiveTransferModal open={receiving} onClose={() => setReceiving(false)} transfer={data} /> : null}
    </Drawer>
  );
}
