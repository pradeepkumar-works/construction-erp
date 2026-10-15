'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Descriptions, Divider, Drawer, Popconfirm, Skeleton, Space, Table, Typography } from 'antd';
import { DeleteOutlined, ImportOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StockEntryType, StockLineDto } from '@erp/shared';
import { canAdjustStock, canKeepStock } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useStockEntry } from '@/lib/queries';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { StockTypeTag } from './StockTypeTag';
import { ReceiveTransferModal } from './ReceiveTransferModal';

const KIND: Record<StockEntryType, string> = {
  RECEIPT: 'Goods received note',
  ISSUE: 'Issue slip',
  ADJUSTMENT: 'Stock adjustment',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  RETURN_TO_VENDOR: 'Return to supplier',
  RETURN_FROM_SITE: 'Return from site',
};

/** A GRN, issue slip, adjustment, transfer or return. Approvers can delete a wrong entry; a transfer in transit can be received. */
export function StockEntryDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useStockEntry(id ?? undefined);
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/stock/entries/${id}`)).data,
    onSuccess: () => {
      message.success(`${data?.entryNo} deleted`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['material-requests'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const mayDelete = !!user && canAdjustStock(user.roleKey);
  const kind = data ? KIND[data.type] : '';
  const [receiving, setReceiving] = useState(false);
  const canReceive = !!data && data.type === 'TRANSFER_OUT' && !data.transferInId && !!user && canKeepStock(user.roleKey);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={640}
      title={data ? <Space>{`${kind} · ${data.entryNo}`}<StockTypeTag type={data.type} /></Space> : 'Stock entry'}
      extra={
        <Space>
          {canReceive ? (
            <Button type="primary" size="small" icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
              Receive at {data!.toProjectName}
            </Button>
          ) : null}
          {data && mayDelete ? (
          <Popconfirm
            title={`Delete ${data.entryNo}?`}
            description="Its quantities come off the stock register."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove.mutate()}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={remove.isPending}>
              Delete
            </Button>
          </Popconfirm>
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
                    ...(data.woNo ? [{ key: 'wo', label: 'Work order', children: `${data.woNo}${data.subcontractBillId ? ', recovered in their bill' : ', to be recovered from their next bill'}` }] : []),
                    { key: 'activity', label: 'Activity', children: data.activityName ?? '-' },
                  ]
                : []),
              { key: 'remarks', label: data.type === 'ADJUSTMENT' || data.type === 'RETURN_TO_VENDOR' ? 'Reason' : 'Remarks', children: data.remarks ?? '-', span: 2 },
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
      {data && canReceive ? <ReceiveTransferModal open={receiving} onClose={() => setReceiving(false)} transfer={data} /> : null}
    </Drawer>
  );
}
