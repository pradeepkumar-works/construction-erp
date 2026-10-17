'use client';

import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { MeasurementSheetDto } from '@erp/shared';
import { sectorLocation } from '@erp/shared';
import { useMeasurement } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { themeFontSize } from '@/lib/theme';

const dim = (v: string | null) => (v === null ? '' : formatQty(v));

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (sheet: MeasurementSheetDto) => void;
}

/** A measurement book sheet, in a drawer from a list or as its own page at `/measurements/<id>`. */
export function MeasurementRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useMeasurement(id ?? undefined);
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={760}
      kind="Measurement"
      list={{ href: '/measurements', label: 'Measurement Book' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/measurements/${data.id}`,
          title: `Measurement · ${data.mbNo}`,
          tags: <StatusTag status={data.status} />,
          facts: [
            { key: 'boq', label: 'BOQ item', children: `${data.boqItemNo} - ${data.boqDescription}` },
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            { key: 'loc', label: 'Location', children: [data.location, sectorLocation(data)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') || '-' },
            ...(data.woNo ? [{ key: 'wo', label: 'Done by', children: `${data.contractorName ?? ''} (${data.woNo})` }] : []),
            { key: 'qty', label: 'Quantity', children: <strong className="mono">{`${formatQty(data.totalQty)} ${data.unit}`}</strong> },
            { key: 'amount', label: `Value at ${formatINR(data.rate, true)} / ${data.unit}`, children: <strong className="mono">{formatINR(data.amount, true)}</strong> },
            ...(data.raBillNo !== null ? [{ key: 'bill', label: 'Billed in', children: `RA bill ${data.raBillNo}` }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data, [{ title: 'Billed', done: data.raBillNo !== null, content: data.raBillNo !== null ? `RA bill ${data.raBillNo}` : undefined }]),
          sections: [
            {
              key: 'lines',
              title: 'Measurements',
              count: data.lines.length,
              children: (
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
              ),
            },
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            {
              key: 'photos',
              title: 'Photos and sketches',
              count: data.attachments.length,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: themeFontSize('fontSizeSM') }}>
                    Measurement ID: {data.id}
                  </Typography.Text>
                </>
              ),
            },
          ],
          activity: { type: 'measurement', id: data.id, submission: data },
          actions: (size) => (
            <>
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="measurement" id={data.id} status={data.status} amount={data.amount} size={size} />
            </>
          ),
        }
      }
    />
  );
}

export function MeasurementDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <MeasurementRecord mode="drawer" {...props} />;
}
