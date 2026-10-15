'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Input, Modal, Segmented, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, RedoOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, InspectionDto, InspectionResult, ReviewDecision } from '@erp/shared';
import { INSPECTION_RESULT_LABELS, INSPECTION_STATUS_LABELS, canRaiseNcr, checklistCounts, mayApproveType } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useInspection } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { QueryError } from '@/components/common/QueryState';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { AuditTrail } from '@/components/common/AuditTrail';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { NcrFormModal, type NcrPrefill } from '@/components/quality/NcrFormModal';

const RESULT_COLORS: Record<InspectionResult, string> = { PASS: 'green', FAIL: 'red', NA: 'default' };

export function ResultTag({ result }: { result: InspectionResult | null }) {
  if (!result) return <span className="text-muted">-</span>;
  return (
    <Tag color={RESULT_COLORS[result]} style={{ margin: 0 }}>
      {INSPECTION_RESULT_LABELS[result]}
    </Tag>
  );
}

const DECISIONS: Record<ReviewDecision, { label: string; done: string }> = {
  APPROVE: { label: 'Pass', done: 'passed' },
  REQUEST_CHANGES: { label: 'Re-inspect', done: 'sent back for re-inspection' },
  REJECT: { label: 'Fail', done: 'failed' },
};

/** The inspector's form: a result and remark per point, photos, a note, then pass, re-inspect or fail. */
function InspectPanel({ data }: { data: InspectionDto }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [results, setResults] = useState<{ result: InspectionResult | null; remark: string }[]>([]);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<AttachmentDto[]>([]);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  useEffect(() => setResults(data.checklist.map((c) => ({ result: c.result, remark: c.remark ?? '' }))), [data.id, data.checklist]);

  const failed = results.filter((r) => r.result === 'FAIL').length;
  const open = results.filter((r) => !r.result).length;
  const mutation = useMutation({
    mutationFn: async (d: ReviewDecision) =>
      (
        await api.post<InspectionDto>(`/inspections/${data.id}/inspect`, {
          decision: d,
          note: note.trim() || undefined,
          results: results.map((r) => ({ result: r.result, remark: r.remark.trim() || undefined })),
          attachmentIds: photos.map((p) => p.id),
        })
      ).data,
    onSuccess: (x, d) => {
      message.success(`${x.inspectionNo} ${DECISIONS[d].done}`);
      setDecision(null);
      qc.invalidateQueries();
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const set = (i: number, patch: Partial<{ result: InspectionResult | null; remark: string }>) => setResults((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <Divider titlePlacement="start" plain>
        Inspect
      </Divider>
      {data.checklist.length > 0 && (
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" onClick={() => setResults((rs) => rs.map((r) => (r.result ? r : { ...r, result: 'PASS' })))} disabled={!open}>
            Mark the rest OK
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {open ? `${open} of ${results.length} points to check` : failed ? `${failed} not OK` : 'All points checked'}
          </Typography.Text>
        </Space>
      )}
      {data.checklist.map((c, i) => (
        <div key={i} className="inspect-point" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', padding: '8px 0', borderBottom: `1px solid ${BRAND.colors.border}` }}>
          <span>
            {i + 1}. {c.item}
          </span>
          <Segmented
            size="small"
            aria-label={`Result of ${c.item}`}
            value={results[i]?.result ?? ''}
            onChange={(v) => set(i, { result: v as InspectionResult })}
            options={[
              { value: 'PASS', label: 'OK' },
              { value: 'FAIL', label: 'Not OK' },
              { value: 'NA', label: 'N/A' },
            ]}
          />
          {results[i]?.result === 'FAIL' && (
            <Input size="small" style={{ gridColumn: '1 / -1' }} placeholder="What is wrong" maxLength={500} value={results[i].remark} onChange={(e) => set(i, { remark: e.target.value })} aria-label={`Remark on ${c.item}`} />
          )}
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Inspector&apos;s photos
        </Typography.Text>
        <PhotoUpload value={photos} onChange={setPhotos} />
      </div>
      <Space wrap style={{ marginTop: 12 }}>
        <Button type="primary" icon={<CheckOutlined />} style={open || failed ? undefined : { background: BRAND.colors.success }} disabled={!!open || !!failed} onClick={() => setDecision('APPROVE')}>
          Pass
        </Button>
        <Button icon={<RedoOutlined />} disabled={!!open} onClick={() => setDecision('REQUEST_CHANGES')}>
          Re-inspect
        </Button>
        <Button danger icon={<CloseOutlined />} disabled={!!open} onClick={() => setDecision('REJECT')}>
          Fail
        </Button>
      </Space>
      <Modal
        open={!!decision}
        title={decision ? `${DECISIONS[decision].label} ${data.inspectionNo}` : ''}
        okText={decision ? DECISIONS[decision].label : 'OK'}
        okButtonProps={{ danger: decision === 'REJECT', loading: mutation.isPending, disabled: decision !== 'APPROVE' && !failed && !note.trim() }}
        onOk={() => decision && mutation.mutate(decision)}
        onCancel={() => setDecision(null)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          {decision === 'APPROVE'
            ? 'The work may proceed.'
            : decision === 'REQUEST_CHANGES'
              ? 'Site rectifies the points not OK and requests the inspection again.'
              : 'The inspection is closed as failed.'}
        </Typography.Paragraph>
        <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={decision === 'APPROVE' ? 'Note (optional)' : failed ? 'Note (optional)' : 'Say what is wrong'} aria-label="Inspector's note" maxLength={1000} />
      </Modal>
    </>
  );
}

export function InspectionDrawer({ id, open, onClose, onEdit }: { id: string | null; open: boolean; onClose: () => void; onEdit?: (x: InspectionDto) => void }) {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useInspection(id ?? undefined);
  const inspector = !!user && !!data && data.status === 'SUBMITTED' && mayApproveType(user, 'INSPECTION');
  const counts = data ? checklistCounts(data.checklist) : null;
  const [ncr, setNcr] = useState<NcrPrefill | null>(null);
  // A failed inspection, or one sent back, can be recorded as a non-conformance.
  const mayRaise = !!user && !!data && canRaiseNcr(user.roleKey) && (data.status === 'REJECTED' || data.status === 'CHANGES_REQUESTED');
  const raise = (x: InspectionDto) => {
    const notOk = x.checklist.filter((c) => c.result === 'FAIL').map((c) => `${c.item}${c.remark ? ` (${c.remark})` : ''}`);
    setNcr({
      projectId: x.projectId,
      inspectionId: x.id,
      activityId: x.activityId,
      location: x.location,
      source: `${x.inspectionNo}, ${x.activityName}`,
      title: `${x.activityName} at ${x.location}`,
      description: [notOk.length ? `Not OK: ${notOk.join('; ')}.` : null, x.reviewNote].filter(Boolean).join(' '),
    });
  };
  return (
    <Drawer
      open={open}
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
      extra={
        data ? (
          <Space>
            {mayRaise ? (
              <Button size="small" danger icon={<WarningOutlined />} onClick={() => raise(data)}>
                Raise NCR
              </Button>
            ) : null}
            <EditResubmitButton entry={data} onEdit={onEdit} size="small" />
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
              { key: 'activity', label: 'Activity', children: <span>{data.activityName}{data.holdPoint && <Tag color="orange" style={{ marginLeft: 8 }}>Hold point</Tag>}</span>, span: 2 },
              { key: 'loc', label: 'Location', children: data.location, span: 2 },
              { key: 'date', label: 'Ready on', children: formatDate(data.date) },
              { key: 'checklist', label: 'Checklist', children: data.checklistName ?? (data.checklist.length ? 'Own points' : 'None') },
              { key: 'remarks', label: 'Remarks', children: data.remarks ?? '-', span: 2 },
              ...submissionMetaItems(data)
                .filter((i) => i.key !== 'status')
                .map((i) => ({ ...i, label: ({ 'Submitted by': 'Requested by', 'Reviewed by': 'Inspected by', 'Review note': "Inspector's note" } as Record<string, string>)[i.label] ?? i.label, span: 2 })),
            ]}
          />
          {inspector ? (
            <InspectPanel data={data} />
          ) : (
            data.checklist.length > 0 && (
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
                    { title: 'Point', dataIndex: 'item', render: (v: string, c) => (c.remark ? <div>{v}<div className="text-muted" style={{ fontSize: 12 }}>{c.remark}</div></div> : v) },
                    { title: 'Result', dataIndex: 'result', width: 120, render: (r: InspectionResult | null) => <ResultTag result={r} /> },
                  ]}
                />
              </>
            )
          )}
          <Divider titlePlacement="start" plain>
            Photos ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />
          <Divider titlePlacement="start" plain>
            Audit trail
          </Divider>
          <AuditTrail type="inspection" id={data.id} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Inspection ID: {data.id}
          </Typography.Text>
        </>
      )}
      <NcrFormModal open={!!ncr} onClose={() => setNcr(null)} prefill={ncr} />
    </Drawer>
  );
}
