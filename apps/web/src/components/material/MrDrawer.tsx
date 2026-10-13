'use client';

import React from 'react';
import { Descriptions, Divider, Drawer, Skeleton, Space, Table } from 'antd';
import type { MaterialRequestDto, MaterialRequestItemDto } from '@erp/shared';
import { useMaterialRequest } from '@/lib/queries';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';

export function MrDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (entry: MaterialRequestDto) => void }) {
  const { data, isLoading, error, refetch } = useMaterialRequest(id ?? undefined);
  return (
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
  );
}
