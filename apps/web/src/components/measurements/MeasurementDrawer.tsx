'use client';

import React from 'react';
import { Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MeasurementSheetDto } from '@erp/shared';
import { CHECK_LEVEL_LABELS, CHECK_OUTCOME_LABELS, figure, sectorLocation, unitLabel } from '@erp/shared';
import { useMeasurement, useMeasurementChecks } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { tk } from '@/ds';

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
  const checks = useMeasurementChecks(data?.status === 'APPROVED' ? data.id : undefined);
  const where = data ? [data.location, sectorLocation(data)].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') : '';
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={760}
      kind="Measurement"
      list={{ href: '/measurements', label: 'Measurement book' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/measurements/${data.id}`,
          title: `Measurement · ${data.mbNo}`,
          tags: <StatusTag status={data.status} />,
          context: { label: data.projectName, href: `/projects/${data.projectId}` },
          headline: [figure('measuredValue', data.amount)],
          facts: [
            { key: 'boq', label: 'BOQ item', children: `${data.boqItemNo} - ${data.boqDescription}` },
            { key: 'qty', label: 'Quantity', children: <span className="mono" translate="no">{`${formatQty(data.totalQty)} ${unitLabel(data.unit)}`}</span> },
            { key: 'rate', label: 'Rate', children: <span translate="no">{`${formatINR(data.rate, true)} / ${unitLabel(data.unit)}`}</span> },
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            ...(where ? [{ key: 'loc', label: 'Location', children: where }] : []),
            ...(data.woNo ? [{ key: 'wo', label: 'Done by', children: `${data.contractorName ?? ''} (${data.woNo})` }] : []),
            ...(data.raBillNo !== null ? [{ key: 'bill', label: 'Billed in', children: `RA bill ${data.raBillNo}` }] : []),
            ...submissionMetaItems(data),
          ],
          lifecycle: submissionLifecycle(data, [{ title: 'Billed', done: data.raBillNo !== null, content: data.raBillNo !== null ? `RA bill ${data.raBillNo}` : undefined }]),
          sections: [
            {
              key: 'lines',
              title: 'Measurement lines',
              count: data.lines.length,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={data.lines}
                  scroll={{ x: 640 }}
                  columns={[
                    { title: 'Description', dataIndex: 'description', render: (v, l) => (l.deduct ? <span>{v} <AppTag meaning="failed">Deduct</AppTag></span> : v) },
                    { title: 'Nos', dataIndex: 'nos', width: 70, align: 'right', render: dim },
                    { title: 'L', dataIndex: 'length', width: 80, align: 'right', render: dim },
                    { title: 'B', dataIndex: 'breadth', width: 80, align: 'right', render: dim },
                    { title: 'D / H', dataIndex: 'depth', width: 80, align: 'right', render: dim },
                    { title: `Qty (${unitLabel(data.unit)})`, dataIndex: 'quantity', width: 110, align: 'right', render: (v) => <span className="mono" translate="no">{formatQty(v)}</span> },
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5}>
                        <strong>Total</strong>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <strong className="mono" translate="no">{formatQty(data.totalQty)}</strong>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              ),
            },
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            // The client's and consultant's checks of the sheet from their portal.
            ...(checks.data?.length
              ? [
                  {
                    key: 'clientChecks',
                    title: "Client's checks",
                    count: checks.data.length,
                    children: (
                      <Table
                        rowKey="id"
                        size="small"
                        pagination={false}
                        dataSource={checks.data}
                        columns={[
                          { title: 'By', key: 'by', render: (_, c) => `${c.checkedByName}, ${CHECK_LEVEL_LABELS[c.level].toLowerCase()}` },
                          { title: 'On', dataIndex: 'checkedOn', width: 110, render: (v: string) => formatDate(v) },
                          { title: 'Found', dataIndex: 'checkedQty', align: 'right', width: 110, render: (v: string) => <span translate="no">{formatQty(v)}</span> },
                          {
                            title: 'Result',
                            key: 'outcome',
                            render: (_, c) => (
                              <span>
                                <AppTag kind="checkOutcome" status={c.outcome}>{CHECK_OUTCOME_LABELS[c.outcome]}</AppTag>
                                {c.note ? <div className="text-muted" style={tk.type.caption}>{c.note}</div> : null}
                              </span>
                            ),
                          },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'photos',
              title: 'Photos and sketches',
              count: data.attachments.length,
              empty: data.attachments.length === 0,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', ...tk.type.caption }}>
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
