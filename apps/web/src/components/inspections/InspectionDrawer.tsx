'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, ConfigProvider, Input, Modal, Segmented, Space, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CheckOutlined, CloseOutlined, RedoOutlined, WarningOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, InspectionDto, InspectionResult, ReviewDecision } from '@erp/shared';
import { CHECK_LEVEL_LABELS, INSPECTION_RESULT_LABELS, INSPECTION_STATUS_LABELS, canRaiseNcr, checklistCounts, mayApproveType } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useInspection } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { approveTheme } from '@/lib/theme';
import { StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { NcrFormModal, type NcrPrefill } from '@/components/quality/NcrFormModal';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle, type Lifecycle } from '@/components/record/lifecycle';

const RESULT_COLORS: Record<InspectionResult, string> = { PASS: 'green', FAIL: 'red', NA: 'default' };

export function ResultTag({ result }: { result: InspectionResult | null }) {
  if (!result) return <span className="text-muted">-</span>;
  return (
    <AppTag color={RESULT_COLORS[result]} style={{ margin: 0 }}>
      {INSPECTION_RESULT_LABELS[result]}
    </AppTag>
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
    meta: FAIL_NOTICE,
  });
  const set = (i: number, patch: Partial<{ result: InspectionResult | null; remark: string }>) => setResults((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      {data.checklist.length > 0 && (
        <Space style={{ marginBottom: 8 }}>
          <Button size="small" onClick={() => setResults((rs) => rs.map((r) => (r.result ? r : { ...r, result: 'PASS' })))} disabled={!open}>
            Mark the rest OK
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {open ? `${open} of ${results.length} points to check` : failed ? `${failed} not OK` : 'All points checked'}
          </Typography.Text>
        </Space>
      )}
      {data.checklist.map((c, i) => (
        <div key={i} className="inspect-point" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', padding: '8px 0', borderBottom: `1px solid ${themeColor('colorBorderSecondary')}` }}>
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
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          Inspector&apos;s photos
        </Typography.Text>
        <PhotoUpload value={photos} onChange={setPhotos} />
      </div>
      <Space wrap style={{ marginTop: 12 }}>
        <ConfigProvider theme={approveTheme}>
          <Button type="primary" icon={<CheckOutlined />} disabled={!!open || !!failed} onClick={() => setDecision('APPROVE')}>
            Pass
          </Button>
        </ConfigProvider>
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

/** The stage bar in an inspection's own words: requested, then passed, failed or re-inspect. */
function inspectionLifecycle(x: InspectionDto): Lifecycle {
  const l = submissionLifecycle(x);
  const titles = ['Draft', 'Requested', x.status === 'SUBMITTED' || x.status === 'DRAFT' ? 'Inspection' : INSPECTION_STATUS_LABELS[x.status]];
  return { ...l, items: l.items.map((item, i) => ({ ...item, title: titles[i] ?? item.title })) };
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (x: InspectionDto) => void;
}

/**
 * An inspection request, in a drawer from a list or as its own page at `/inspections/<id>`. QA/QC records the checklist
 * and passes or fails it here; in the Approvals inbox's pane the checklist is read only and the inbox opens the drawer.
 */
export function InspectionRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useInspection(id ?? undefined);
  const inspector = mode !== 'pane' && !!user && !!data && data.status === 'SUBMITTED' && mayApproveType(user, 'INSPECTION');
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
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={720}
      kind="Inspection"
      list={{ href: '/inspections', label: 'Quality' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/inspections/${data.id}`,
          title: `Inspection · ${data.inspectionNo}`,
          tags: <StatusTag status={data.status} labels={INSPECTION_STATUS_LABELS} />,
          facts: [
            { key: 'activity', label: 'Activity', children: <span>{data.activityName}{data.holdPoint && <AppTag tone="pending" style={{ marginLeft: 8 }}>Hold point</AppTag>}</span> },
            { key: 'loc', label: 'Location', children: data.location },
            { key: 'date', label: 'Ready on', children: formatDate(data.date) },
            { key: 'checklist', label: 'Checklist', children: data.checklistName ?? (data.checklist.length ? 'Own points' : 'None') },
            // Hidden work: signed off before cover-up and countersigned by the client's side in their portal.
            ...(data.hidden
              ? [
                  {
                    key: 'hidden',
                    label: 'Hidden work',
                    children: data.hidden.signedAt
                      ? `Signed off by ${data.hidden.signedByName ?? ''}${data.hidden.signedLevel ? ` (${CHECK_LEVEL_LABELS[data.hidden.signedLevel].toLowerCase()})` : ''}${data.hidden.qty ? `, measured ${data.hidden.qty}` : ''}; ${data.hidden.countersignedAt ? `countersigned by ${data.hidden.countersignedByName ?? ''}` : 'waiting for the countersign'}`
                      : 'Waiting for the sign-off before cover-up, in the client portal',
                  },
                ]
              : []),
            ...submissionMetaItems(data)
              .filter((i) => i.key !== 'status')
              .map((i) => ({ ...i, label: ({ 'Submitted by': 'Requested by', 'Reviewed by': 'Inspected by', 'Review note': "Inspector's note" } as Record<string, string>)[i.label as string] ?? i.label })),
          ],
          lifecycle: inspectionLifecycle(data),
          sections: [
            ...(data.remarks ? [{ key: 'remarks', title: 'Remarks', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</div> }] : []),
            ...(inspector
              ? [{ key: 'inspect', title: 'Inspect', children: <InspectPanel data={data} /> }]
              : data.checklist.length > 0
                ? [
                    {
                      key: 'checklist',
                      title: `Checklist${counts && counts.open < counts.total ? ` (${counts.pass} OK, ${counts.fail} not OK${counts.na ? `, ${counts.na} N/A` : ''})` : ''}`,
                      children: (
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
                      ),
                    },
                  ]
                : []),
            {
              key: 'photos',
              title: 'Photos',
              count: data.attachments.length,
              children: (
                <>
                  <AttachmentGallery attachments={data.attachments} />
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: themeFontSize('fontSizeSM') }}>
                    Inspection ID: {data.id}
                  </Typography.Text>
                </>
              ),
            },
          ],
          activity: { type: 'inspection', id: data.id, submission: data },
          actions: (size) => (
            <>
              {mayRaise ? (
                <Button size={size} danger icon={<WarningOutlined />} onClick={() => raise(data)}>
                  New NCR
                </Button>
              ) : null}
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
            </>
          ),
        }
      }
    >
      <NcrFormModal open={!!ncr} onClose={() => setNcr(null)} prefill={ncr} />
    </RecordFrame>
  );
}

export function InspectionDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <InspectionRecord mode="drawer" {...props} />;
}
