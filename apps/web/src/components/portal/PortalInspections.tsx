'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Form, Input, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { EyeOutlined } from '@/components/common/icons';
import type { UseQueryResult } from '@tanstack/react-query';
import type { InspectionResult, PortalInspectionDto } from '@erp/shared';
import { CHECK_LEVEL_LABELS, INSPECTION_STATUS_LABELS, checklistCounts, isGuest } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCountersignHidden, useSignHidden, useWitnessInspection } from '@/lib/queries';
import { QuantityInput } from '@/components/form/inputs';
import { formatDate, formatDateTime, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ResultTag } from '@/components/inspections/InspectionDrawer';
import { themeFontSize } from '@/lib/theme';

/** Inspections requested on the project: the client's engineer can see the checklist and record that they attended. */
export function PortalInspections({ inspections, openId, onOpen }: { inspections: UseQueryResult<PortalInspectionDto[]>; openId: string | null; onOpen: (id: string | null) => void }) {
  const { data, isLoading, error, refetch } = inspections;
  const open = data?.find((x) => x.id === openId) ?? null;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PortalInspectionDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No inspections requested yet' }}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'No.', dataIndex: 'inspectionNo', width: 130 },
          {
            title: 'Activity',
            dataIndex: 'activityName',
            render: (v: string, r) => (
              <span>
                {v}
                {r.holdPoint && (
                  <AppTag tone="pending" style={{ marginLeft: 8 }}>
                    Hold point
                  </AppTag>
                )}
                {r.hiddenWork && (
                  <AppTag tone={r.hidden?.countersignedAt ? 'success' : r.hidden?.signedAt ? 'info' : 'pending'} style={{ marginLeft: 8 }}>
                    {r.hidden?.countersignedAt ? 'Hidden work countersigned' : r.hidden?.signedAt ? 'Hidden work to countersign' : 'Hidden work'}
                  </AppTag>
                )}
              </span>
            ),
          },
          { title: 'Location', dataIndex: 'location', ellipsis: true },
          { title: 'Ready on', dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Status', dataIndex: 'status', width: 120, render: (s: PortalInspectionDto['status']) => <StatusTag status={s} labels={INSPECTION_STATUS_LABELS} /> },
          { title: 'Attended', key: 'w', width: 160, render: (_, r) => (r.witnessedAt ? `${r.witnessedByName ?? ''}, ${formatDate(r.witnessedAt)}` : NO_VALUE) },
        ]}
      />
      <PortalInspectionDrawer data={open} onClose={() => onOpen(null)} />
    </>
  );
}

function PortalInspectionDrawer({ data, onClose }: { data: PortalInspectionDto | null; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const witness = useWitnessInspection();
  const [note, setNote] = useState('');
  useEffect(() => setNote(data?.witnessNote ?? ''), [data?.id, data?.witnessNote]);
  const counts = data ? checklistCounts(data.checklist) : null;
  const mayWitness = !!user && isGuest(user.roleKey) && data?.status === 'SUBMITTED';

  const save = async () => {
    if (!data) return;
    try {
      await witness.mutateAsync({ id: data.id, note: note.trim() || null });
      message.success(`Recorded that you attended ${data.inspectionNo}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={720}
      title={
        data ? (
          <span>
            {data.inspectionNo} <StatusTag status={data.status} labels={INSPECTION_STATUS_LABELS} />
          </span>
        ) : (
          'Inspection'
        )
      }
      destroyOnHidden
    >
      {data && (
        <>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'activity', label: 'Activity', children: data.activityName, span: 2 },
              { key: 'loc', label: 'Location', children: data.location, span: 2 },
              { key: 'date', label: 'Ready on', children: formatDate(data.date) },
              { key: 'by', label: 'Requested by', children: data.submittedByName ?? NO_VALUE },
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? NO_VALUE, span: 2 },
              ...(data.reviewedByName
                ? [
                    { key: 'insp', label: 'Inspected by', children: `${data.reviewedByName}${data.reviewedAt ? `, ${formatDateTime(data.reviewedAt)}` : ''}`, span: 2 },
                    { key: 'note', label: "Inspector's note", children: data.reviewNote ?? NO_VALUE, span: 2 },
                  ]
                : []),
              ...(data.witnessedAt
                ? [{ key: 'w', label: 'Attended for the client', children: `${data.witnessedByName ?? ''}, ${formatDateTime(data.witnessedAt)}${data.witnessNote ? `: ${data.witnessNote}` : ''}`, span: 2 }]
                : []),
            ]}
          />
          {mayWitness && (
            <>
              <Divider titlePlacement="start" plain>
                Attend
              </Divider>
              <Typography.Paragraph type="secondary">Record that you were present for this inspection. Your remarks go to the site team and the quality engineer.</Typography.Paragraph>
              <Form layout="vertical" component={false}>
          <Form.Item label="Your remarks" htmlFor="witness-remarks" style={{ marginBottom: 0 }}>
            <Input.TextArea id="witness-remarks" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Form.Item>
        </Form>
              <Button type="primary" icon={<EyeOutlined />} style={{ marginTop: 8 }} loading={witness.isPending} onClick={save}>
                {data.witnessedAt ? 'Update my remarks' : 'I attended this inspection'}
              </Button>
            </>
          )}
          {data.hiddenWork ? <HiddenWorkSection key={`hidden-${data.id}`} data={data} /> : null}
          {data.checklist.length > 0 && (
            <>
              <Divider titlePlacement="start" plain>
                Checklist{counts && counts.open < counts.total ? ` (${counts.pass} OK, ${counts.fail} not OK${counts.na ? `, ${counts.na} N/A` : ''})` : ''}
              </Divider>
              <Table
                rowKey={(_, i) => String(i)}
                size="small"
                pagination={false}
                dataSource={data.checklist}
                columns={[
                  { title: '#', key: 'n', width: 40, render: (_, __, i) => i + 1 },
                  { title: 'Point', dataIndex: 'item', render: (v: string, c) => (c.remark ? <div>{v}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{c.remark}</div></div> : v) },
                  { title: 'Result', dataIndex: 'result', width: 120, render: (r: InspectionResult | null) => <ResultTag result={r} /> },
                ]}
              />
            </>
          )}
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
        </>
      )}
    </Drawer>
  );
}

/**
 * Hidden work: measured before it is covered and signed off here at the guest's level, then countersigned by
 * someone above (or the client's engineer). Its progress is approved only once both are in and the inspection passed.
 */
function HiddenWorkSection({ data }: { data: PortalInspectionDto }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const sign = useSignHidden();
  const countersign = useCountersignHidden();
  const h = data.hidden;
  const [qty, setQty] = useState<number | null>(h?.qty ? Number(h.qty) : null);
  const [note, setNote] = useState(h?.note ?? '');
  const [counterNote, setCounterNote] = useState('');
  const guest = !!user && isGuest(user.roleKey);
  const open = data.status === 'SUBMITTED' || data.status === 'APPROVED';
  const maySign = guest && open && !h?.countersignedAt;
  const mayCountersign = guest && !!h?.signedAt && !h.countersignedAt && h.signedById !== user?.id;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      message.success(done);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <>
      <Divider titlePlacement="start" plain>
        Hidden work
      </Divider>
      <Typography.Paragraph type="secondary">This work is covered once done. Measure it and sign it off before it is covered; someone above you, or the client&apos;s engineer, countersigns. Its progress is approved only after both.</Typography.Paragraph>
      {h?.signedAt ? (
        <Descriptions
          size="small"
          column={1}
          bordered
          items={[
            { key: 's', label: 'Signed off', children: `${h.signedByName ?? ''}${h.signedLevel ? `, ${CHECK_LEVEL_LABELS[h.signedLevel].toLowerCase()}` : ''}, ${formatDateTime(h.signedAt)}${h.qty ? `. Measured ${h.qty}` : ''}${h.note ? `. ${h.note}` : ''}` },
            { key: 'c', label: 'Countersigned', children: h.countersignedAt ? `${h.countersignedByName ?? ''}, ${formatDateTime(h.countersignedAt)}${h.countersignNote ? `: ${h.countersignNote}` : ''}` : 'Not yet' },
          ]}
        />
      ) : null}
      {maySign ? (
        <div style={{ marginTop: 12 }}>
          <QuantityInput aria-label="Quantity measured before cover-up" placeholder="Quantity measured" value={qty} onChange={(v) => setQty(v ?? null)} style={{ maxWidth: 240 }} />
          <Input.TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you measured and checked" aria-label="Sign-off note" maxLength={2000} style={{ marginTop: 8 }} />
          <Button
            style={{ marginTop: 8 }}
            loading={sign.isPending}
            onClick={() => run(() => sign.mutateAsync({ id: data.id, qty: qty == null ? null : String(qty), note: note.trim() || null }), `Hidden work on ${data.inspectionNo} signed off`)}
          >
            {h?.signedAt ? 'Sign off again' : 'Sign off before cover-up'}
          </Button>
        </div>
      ) : null}
      {mayCountersign ? (
        <div style={{ marginTop: 12 }}>
          <Input.TextArea rows={2} value={counterNote} onChange={(e) => setCounterNote(e.target.value)} placeholder="Note (optional)" aria-label="Countersign note" maxLength={2000} />
          <Button type="primary" style={{ marginTop: 8 }} loading={countersign.isPending} onClick={() => run(() => countersign.mutateAsync({ id: data.id, note: counterNote.trim() || null }), `Hidden work on ${data.inspectionNo} countersigned`)}>
            Countersign
          </Button>
        </div>
      ) : null}
    </>
  );
}
