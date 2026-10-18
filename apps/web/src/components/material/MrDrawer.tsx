'use client';

import React, { useState } from 'react';
import { Button, Table, Typography } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import type { MaterialRequestDto, MaterialRequestItemDto } from '@erp/shared';
import { canKeepStock, canViewPurchaseOrders } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMaterialRequest } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { ReceiptModal } from '@/components/stock/ReceiptModal';
import { QuotationsPanel } from '@/components/purchasing/QuotationsPanel';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: MaterialRequestDto) => void;
}

/** A material request, in a drawer from a list or as its own page at `/material-requests/<id>`. */
export function MrRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useMaterialRequest(id ?? undefined);
  const { user } = useAuth();
  const [receiving, setReceiving] = useState(false);
  const pending = data?.status === 'APPROVED' && data.items.some((i) => Number(i.receivedQty) < Number(i.quantity));
  const mayReceive = pending && !!user && canKeepStock(user.roleKey);
  const purchasing = data?.status === 'APPROVED' && !!user && canViewPurchaseOrders(user.roleKey);
  const receivedLines = data?.items.filter((i) => Number(i.receivedQty) >= Number(i.quantity)).length ?? 0;
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={purchasing ? 960 : 680}
      kind="Material request"
      list={{ href: '/material-requests', label: 'Material requests' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/material-requests/${data.id}`,
          title: `Material request · ${data.requestNo}`,
          tags: <StatusTag status={data.status} />,
          facts: [
            { key: 'no', label: 'Request no.', children: data.requestNo },
            { key: 'priority', label: 'Priority', children: <PriorityTag priority={data.priority} /> },
            { key: 'req', label: 'Required by', children: formatDate(data.requiredDate) },
            { key: 'count', label: 'Line items', children: data.items.length },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data, [{ title: 'Received', done: receivedLines === data.items.length, content: data.status === 'APPROVED' ? `${receivedLines} of ${data.items.length} lines` : undefined }]),
          sections: [
            {
              key: 'items',
              title: 'Items',
              count: data.items.length,
              children: (
                <Table<MaterialRequestItemDto>
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={data.items}
                  scroll={{ x: 640 }}
                  columns={[
                    { title: '#', key: 'idx', width: 40, render: (_, __, i) => i + 1 },
                    { title: 'Item', dataIndex: 'itemName' },
                    { title: 'Specification', dataIndex: 'specification', render: (v) => v ?? <span className="text-muted">-</span> },
                    { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 90, render: (v) => formatQty(v) },
                    { title: 'Unit', dataIndex: 'unit', width: 80 },
                    ...(data.status === 'APPROVED'
                      ? [
                          {
                            title: 'Ordered',
                            dataIndex: 'orderedQty',
                            align: 'right' as const,
                            width: 100,
                            render: (v: string) => (Number(v) > 0 ? formatQty(v) : <span className="text-muted">0</span>),
                          },
                          {
                            title: 'Received',
                            dataIndex: 'receivedQty',
                            align: 'right' as const,
                            width: 110,
                            render: (v: string, i: MaterialRequestItemDto) =>
                              Number(v) >= Number(i.quantity) ? (
                                <Typography.Text type="success">{formatQty(v)}</Typography.Text>
                              ) : Number(v) > 0 ? (
                                <Typography.Text type="warning">{formatQty(v)}</Typography.Text>
                              ) : (
                                <span className="text-muted">0</span>
                              ),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            },
            ...(purchasing ? [{ key: 'buying', title: 'Quotations and purchase orders', children: <QuotationsPanel request={data} /> }] : []),
            ...(data.attachments.length > 0 ? [{ key: 'attachments', title: 'Attachments', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> }] : []),
          ],
          activity: { type: 'material_request', id: data.id, submission: data },
          actions: (size) => (
            <>
              {mayReceive ? (
                <Button type="primary" size={size} icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
                  Receive material
                </Button>
              ) : null}
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="material_request" id={data.id} status={data.status} size={size} />
            </>
          ),
        }
      }
    >
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} materialRequestId={data?.id} />
    </RecordFrame>
  );
}

export function MrDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <MrRecord mode="drawer" {...props} />;
}
