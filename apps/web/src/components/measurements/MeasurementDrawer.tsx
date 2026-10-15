'use client';

import React from 'react';
import { Descriptions, Divider, Drawer, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { MeasurementSheetDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { useMeasurement } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';

const dim = (v: string | null) => (v === null ? '' : formatQty(v));

export function MeasurementDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (x: MeasurementSheetDto) => void }) {
  const { data, isLoading, error, refetch } = useMeasurement(id ?? undefined);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={760}
      title={
        data ? (
          <span>
            {data.mbNo} <StatusTag status={data.status} />
          </span>
        ) : (
          'Measurement'
        )
      }
      extra={
        data ? (
          <Space wrap>
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
            <ReviewActions type="measurement" id={data.id} status={data.status} amount={data.amount} size="small" />
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
            items={[
              { key: 'boq', label: 'BOQ item', children: `${data.boqItemNo} - ${data.boqDescription}`, span: 2 },
              { key: 'date', label: 'Date', children: formatDate(data.date) },
              { key: 'loc', label: 'Location', children: [data.location, sectorLocation(data)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') },
              ...(data.woNo ? [{ key: 'wo', label: 'Done by', children: `${data.contractorName ?? ''} (${data.woNo})` }] : []),
              { key: 'qty', label: 'Quantity', children: <strong>{`${formatQty(data.totalQty)} ${data.unit}`}</strong> },
              { key: 'amount', label: `Value at ${formatINR(data.rate, true)} / ${data.unit}`, children: <strong>{formatINR(data.amount, true)}</strong> },
              ...(data.raBillNo !== null ? [{ key: 'bill', label: 'Billed in', children: `RA bill ${data.raBillNo}`, span: 2 }] : []),
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              ...submissionMetaItems(data).filter((i) => i.key !== 'status').map((i) => ({ ...i, span: 2 })),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Measurements ({data.lines.length})
          </Divider>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.lines}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Description', dataIndex: 'description', render: (v, l) => (l.deduct ? <span>{v} <Tag color="red">Deduct</Tag></span> : v) },
              { title: 'Nos', dataIndex: 'nos', width: 70, align: 'right', render: dim },
              { title: 'L', dataIndex: 'length', width: 80, align: 'right', render: dim },
              { title: 'B', dataIndex: 'breadth', width: 80, align: 'right', render: dim },
              { title: 'D / H', dataIndex: 'depth', width: 80, align: 'right', render: dim },
              { title: `Qty (${data.unit})`, dataIndex: 'quantity', width: 110, align: 'right', render: (v) => <span className="mono">{formatQty(v)}</span> },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={5}>
                  <strong>Total</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <strong className="mono">{formatQty(data.totalQty)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
          <Divider titlePlacement="start" plain>
            Photos and sketches ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="measurement" id={data.id} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Measurement ID: {data.id}
          </Typography.Text>
        </>
      )}
    </Drawer>
  );
}
