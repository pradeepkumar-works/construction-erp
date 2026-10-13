'use client';

import React, { useState } from 'react';
import { Button, Descriptions, Divider, Drawer, Skeleton, Space, Table, Typography } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import type { MaterialRequestDto, MaterialRequestItemDto } from '@erp/shared';
import { canKeepStock } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMaterialRequest } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { ReceiptModal } from '@/components/stock/ReceiptModal';

export function MrDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (entry: MaterialRequestDto) => void }) {
  const { data, isLoading, error, refetch } = useMaterialRequest(id ?? undefined);
  const { user } = useAuth();
  const [receiving, setReceiving] = useState(false);
  const pending = data?.status === 'APPROVED' && data.items.some((i) => Number(i.receivedQty) < Number(i.quantity));
  const mayReceive = pending && !!user && canKeepStock(user.roleKey);
  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        width={680}
        title={
          data ? (
            <Space>
              <span>Material request · {data.requestNo}</span>
              <StatusTag status={data.status} />
            </Space>
          ) : (
            'Material request'
          )
        }
        extra={
          data ? (
            <Space wrap>
              {mayReceive ? (
                <Button type="primary" size="small" icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
                  Receive material
                </Button>
              ) : null}
              <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
              <ReviewActions type="material_request" id={data.id} status={data.status} size="small" />
            </Space>
          ) : null
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
                { key: 'no', label: 'Request no.', children: data.requestNo },
                { key: 'priority', label: 'Priority', children: <PriorityTag priority={data.priority} /> },
                { key: 'req', label: 'Required by', children: formatDate(data.requiredDate) },
                { key: 'count', label: 'Line items', children: data.items.length },
                { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
                ...submissionMetaItems(data).filter((i) => i.key !== 'status').map((i) => ({ ...i, span: 2 })),
              ]}
            />
            <Table<MaterialRequestItemDto>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.items}
              columns={[
                { title: '#', key: 'idx', width: 40, render: (_, __, i) => i + 1 },
                { title: 'Item', dataIndex: 'itemName' },
                { title: 'Specification', dataIndex: 'specification', render: (v) => v ?? <span className="text-muted">-</span> },
                { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 90, render: (v) => formatQty(v) },
                { title: 'Unit', dataIndex: 'unit', width: 80 },
                ...(data.status === 'APPROVED'
                  ? [
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
            {data.attachments.length > 0 && (
              <>
                <Divider titlePlacement="start" plain>
                  Attachments
                </Divider>
                <AttachmentGallery attachments={data.attachments} />
              </>
            )}
            <Divider titlePlacement="start" plain>
              Audit trail
            </Divider>
            <AuditTrail type="material_request" id={data.id} />
          </>
        )}
      </Drawer>
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} materialRequestId={data?.id} />
    </>
  );
}
