'use client';

import React, { useEffect, useRef } from 'react';
import { Checkbox, Form, Input, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  DESIGN_CODES,
  DESIGN_PURPOSE_LABELS,
  DESIGN_PURPOSES,
  DESIGN_SUBMISSION_KIND_LABELS,
  DESIGN_SUBMISSION_KINDS,
  DRAWING_SOURCE_LABELS,
  DRAWING_SOURCES,
  REVISION_STATUS_LABELS,
  designRevisionLabel,
  designStatusLabel,
  replyByFor,
  type AttachmentDto,
  type DesignCode,
  type DesignPurpose,
  type DesignSubmissionDetailDto,
  type DesignSubmissionKind,
  type DesignSubmissionStatus,
  type DrawingSource,
} from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useDesignSubmissionAction, useDocuments } from '@/lib/queries';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { LineTable } from '@/components/form/LineTable';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { PhotoUpload } from '@/components/common/PhotoUpload';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const afterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

const STATUS_TONE: Record<DesignSubmissionStatus, 'neutral' | 'info' | 'success' | 'pending' | 'danger'> = {
  DRAFT: 'neutral',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  APPROVED_AS_NOTED: 'success',
  REVISE_RESUBMIT: 'pending',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
};

/** Where a submission stands; a review past its reply-by date says how late. */
export function DesignStatusTag({ status, purpose, daysLate }: { status: DesignSubmissionStatus; purpose: DesignPurpose; daysLate?: number | null }) {
  if (status === 'UNDER_REVIEW' && daysLate) return <AppTag tone="danger" dot>{`Reply ${daysLate} day${daysLate === 1 ? '' : 's'} late`}</AppTag>;
  return (
    <AppTag tone={STATUS_TONE[status]} dot>
      {designStatusLabel(status, purpose)}
    </AppTag>
  );
}

const CODE_TONE: Record<DesignCode, 'success' | 'pending' | 'danger'> = { A: 'success', B: 'success', C: 'pending', D: 'danger' };
const CODE_WORDS: Record<DesignCode, string> = { A: 'approved', B: 'approved with comments', C: 'revise and resubmit', D: 'rejected' };
export const codeLabel = (code: DesignCode, purpose: DesignPurpose) => `Code ${code}, ${purpose === 'VETTING' && (code === 'A' || code === 'B') ? (code === 'A' ? 'vetted' : 'vetted with remarks') : CODE_WORDS[code]}`;
export function CodeTag({ code, purpose }: { code: DesignCode; purpose: DesignPurpose }) {
  return <AppTag tone={CODE_TONE[code]}>{codeLabel(code, purpose)}</AppTag>;
}

interface SubmissionValues {
  projectId?: string;
  title: string;
  kind: DesignSubmissionKind;
  purpose: DesignPurpose;
  toParty: string;
  source: DrawingSource;
  documentIds: string[];
  note?: string | null;
  fee?: string | null;
  files?: AttachmentDto[];
}

/** Raise a design submission (a draft) with the documents of the register it sends, or change one. */
export function DesignSubmissionForm({
  open,
  onClose,
  submission,
  projectId: scoped,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  submission?: DesignSubmissionDetailDto | null;
  projectId?: string;
  onSaved?: (id: string) => void;
}) {
  const [form] = Form.useForm<SubmissionValues>();
  const act = useDesignSubmissionAction();
  const notify = useNotify();
  const saved = useRef<string | null>(null);
  const projectId = Form.useWatch('projectId', form) ?? submission?.projectId;
  const purpose = Form.useWatch('purpose', form) ?? 'APPROVAL';
  const docs = useDocuments({ projectId, pageSize: 500 }, open && !!projectId);
  const sent = !!submission && submission.rounds.length > 0;
  const docsLocked = sent && submission.status !== 'REVISE_RESUBMIT' && submission.status !== 'REJECTED';

  useEffect(() => {
    if (!open) return;
    if (submission)
      form.setFieldsValue({
        projectId: submission.projectId,
        title: submission.title,
        kind: submission.kind,
        purpose: submission.purpose,
        toParty: submission.toParty,
        source: submission.purpose === 'VETTING' ? 'CLIENT' : submission.source,
        documentIds: submission.docs.map((d) => d.documentId),
        note: submission.note,
        fee: submission.fee,
        files: submission.attachments,
      });
    else form.setFieldsValue({ projectId: scoped, kind: 'DRAWINGS', purpose: 'APPROVAL', source: 'CLIENT', documentIds: [], files: [] });
  }, [open, submission, scoped, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      title={submission ? `Edit ${submission.submissionNo}` : 'New design submission'}
      okText={submission ? 'Save' : 'Save draft'}
      draftKey={submission ? undefined : 'design-submission:new'}
      onSubmit={async (v) => {
        const body = {
          title: v.title.trim(),
          kind: v.kind,
          purpose: v.purpose,
          toParty: v.toParty.trim(),
          source: v.source,
          documentIds: v.documentIds ?? [],
          note: v.note?.trim() || null,
          fee: v.purpose === 'VETTING' && v.fee ? String(v.fee) : null,
          attachmentIds: (v.files ?? []).map((f) => f.id),
          projectId: v.projectId ?? submission?.projectId,
        };
        const row = submission ? await act.mutateAsync({ method: 'put', path: `/design/submissions/${submission.id}`, body }) : await act.mutateAsync({ path: '/design/submissions', body });
        saved.current = row.id;
        notify.saved(submission ? `${submission.submissionNo} saved` : `${row.submissionNo} saved as a draft`);
        if (!submission && onSaved) afterFormLeaves(() => saved.current && onSaved(saved.current));
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="What goes">
          <FormGrid cols={2}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <ProjectSelect disabled={!!submission} onChange={() => form.setFieldValue('documentIds', [])} />
            </Form.Item>
            <Form.Item name="purpose" label="Sent">
              <Segmented disabled={sent} options={DESIGN_PURPOSES.map((p) => ({ value: p, label: DESIGN_PURPOSE_LABELS[p] }))} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Say what is being submitted' }]}>
              <Input maxLength={200} placeholder="Superstructure drawings, first and second floor slabs" />
            </Form.Item>
            <Form.Item name="kind" label="Kind">
              <Select options={DESIGN_SUBMISSION_KINDS.map((k) => ({ value: k, label: DESIGN_SUBMISSION_KIND_LABELS[k] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item
            name="documentIds"
            label="Drawings and documents"
            extra={docsLocked ? 'The drawings change only while it is a draft or back with us.' : 'From the register. Each goes at its current revision when the submission is sent.'}
          >
            <Select
              mode="multiple"
              disabled={!projectId || docsLocked}
              placeholder={projectId ? 'Choose from the register' : 'Choose the project first'}
              showSearch={{ optionFilterProp: 'label' }}
              loading={docs.isLoading}
              options={(docs.data?.items ?? []).map((d) => ({
                value: d.id,
                label: `${d.docNo} ${d.title}${d.current ? ` (${d.current.revision}, ${REVISION_STATUS_LABELS[d.current.status].toLowerCase()})` : ', no revision yet'}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} placeholder="What it holds up on site, or what the reviewer should look at first" />
          </Form.Item>
        </FormSection>
        <FormSection title="Who reviews it">
          <FormGrid cols={2}>
            <Form.Item name="toParty" label="To" rules={[{ required: true, whitespace: true, message: 'Say who it goes to' }]}>
              <Input maxLength={300} placeholder={purpose === 'VETTING' ? 'The Head, Department of Civil Engineering' : 'The Engineer-in-charge'} />
            </Form.Item>
            {purpose === 'VETTING' ? (
              <Form.Item name="fee" label="Vetting fee">
                <MoneyInput />
              </Form.Item>
            ) : (
              <Form.Item name="source" label="Reviewer’s side" extra="A late review by the client’s side can be recorded as a delay.">
                <Select options={DRAWING_SOURCES.filter((s) => s !== 'OWN' && s !== 'DESIGN_CONSULTANT').map((s) => ({ value: s, label: DRAWING_SOURCE_LABELS[s] }))} />
              </Form.Item>
            )}
          </FormGrid>
          <Form.Item name="files" label="Design reports, calculations and the reviewer’s marked-up copies">
            <PhotoUpload drawings max={10} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** Send the package: R0 from a draft, or the next round after a C or D, at the register's current revisions. */
export function SubmitDesignDialog({ submission, open, onClose }: { submission: DesignSubmissionDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ submittedOn: dayjs.Dayjs; replyBy?: dayjs.Dayjs | null; note?: string; letter: boolean }>();
  const act = useDesignSubmissionAction();
  const notify = useNotify();
  const again = submission.rounds.length > 0;
  const next = again ? submission.revision + 1 : 0;
  const submittedOn = Form.useWatch('submittedOn', form);
  useEffect(() => {
    if (open) form.setFieldsValue({ submittedOn: dayjs(), replyBy: null, note: undefined, letter: true });
  }, [open, form]);
  const answered = submission.comments.filter((c) => c.state === 'ANSWERED').length;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={again ? `Resubmit as ${designRevisionLabel(next)}` : submission.purpose === 'VETTING' ? 'Send for vetting' : 'Submit for approval'}
      okText={again ? 'Resubmit' : 'Submit'}
      onSubmit={async (v) => {
        const out = await act.mutateAsync({
          path: `/design/submissions/${submission.id}/submit`,
          body: { submittedOn: ymd(v.submittedOn), replyBy: ymd(v.replyBy), note: v.note?.trim() || null, letter: v.letter },
        });
        const letter = out.rounds[0]?.letterId;
        notify.saved(`${submission.submissionNo} ${designRevisionLabel(next)} sent to ${submission.toParty}${letter ? '. The covering letter is a draft in Correspondence.' : ''}`);
      }}
    >
      <Typography.Paragraph type="secondary">
        {`Sends ${submission.docs.map((d) => `${d.docNo} ${d.revision ?? ''}`.trim()).join(', ')}${again && answered ? `, with the replies to ${answered} comment${answered === 1 ? '' : 's'}` : ''}.`}
      </Typography.Paragraph>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="submittedOn" label="Submitted on" rules={[{ required: true, message: 'Choose the day it was submitted' }]}>
            <DatePicker disabledDate={afterToday} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="replyBy" label="Reply asked by" extra={submittedOn ? `${dayjs(replyByFor(submittedOn.format('YYYY-MM-DD'))).format('DD MMM YYYY')} when left empty` : undefined}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => !!submittedOn && d.isBefore(submittedOn, 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label={again ? 'What changed' : 'Covering note'}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} placeholder={again ? 'Lap lengths revised at the column junctions as asked' : 'Design basis report and calculations enclosed'} />
        </Form.Item>
        <Form.Item name="letter" valuePropName="checked">
          <Checkbox>Draft the covering letter in Correspondence</Checkbox>
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface CodeValues {
  code: DesignCode;
  reviewedOn: dayjs.Dayjs;
  reviewerName?: string;
  reviewRef?: string;
  certificateNo?: string;
  comments: { text: string; documentId?: string | null }[];
}

/** The code the round came back with and each of the reviewer's comments, from their letter or marked-up copy. */
export function RecordCodeDialog({ submission, open, onClose }: { submission: DesignSubmissionDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<CodeValues>();
  const act = useDesignSubmissionAction();
  const notify = useNotify();
  const code = Form.useWatch('code', form);
  const round = submission.rounds[0];
  useEffect(() => {
    if (open) form.setFieldsValue({ code: undefined, reviewedOn: dayjs(), reviewerName: undefined, reviewRef: undefined, certificateNo: undefined, comments: [] });
  }, [open, form]);
  const vetting = submission.purpose === 'VETTING';
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={820}
      projectDefault={false}
      title={`Record the code for ${designRevisionLabel(submission.revision)}`}
      okText="Record"
      onSubmit={async (v) => {
        await act.mutateAsync({
          path: `/design/submissions/${submission.id}/code`,
          body: {
            code: v.code,
            reviewedOn: ymd(v.reviewedOn),
            reviewerName: v.reviewerName?.trim() || null,
            reviewRef: v.reviewRef?.trim() || null,
            certificateNo: v.certificateNo?.trim() || null,
            comments: (v.comments ?? []).filter((c) => c.text?.trim()).map((c) => ({ text: c.text.trim(), documentId: c.documentId ?? null })),
          },
        });
        notify.saved(`${submission.submissionNo}: ${codeLabel(v.code, submission.purpose).toLowerCase()}`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="What came back">
          <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Choose the code it came back with' }]}>
            <Segmented options={DESIGN_CODES.map((c) => ({ value: c, label: codeLabel(c, submission.purpose).replace('Code ', '') }))} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="reviewedOn" label="Reviewed on" rules={[{ required: true, message: 'Choose the day of the review' }]}>
              <DatePicker disabledDate={(d) => afterToday(d) || (!!round && d.isBefore(dayjs(round.submittedOn), 'day'))} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="reviewRef" label="Letter or mail reference">
              <Input maxLength={120} placeholder="AE/TL/118" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="reviewerName" label="Reviewed by">
              <Input maxLength={200} placeholder={submission.toParty} />
            </Form.Item>
            {vetting && (code === 'A' || code === 'B') ? (
              <Form.Item name="certificateNo" label="Vetting certificate number" rules={[{ required: true, whitespace: true, message: 'Give the certificate number' }]}>
                <Input maxLength={120} translate="no" />
              </Form.Item>
            ) : null}
          </FormGrid>
          {code && code !== 'C' && code !== 'D' && !vetting ? (
            <Typography.Paragraph type="secondary">The register’s revisions sent for approval become {code === 'A' ? 'approved' : 'approved with comments'}, and comments answered so far close.</Typography.Paragraph>
          ) : null}
        </FormSection>
        <FormSection title="The reviewer’s comments">
          <LineTable
            name="comments"
            label="Comment"
            addText="Add comment"
            min={code && code !== 'A' ? 1 : 0}
            newLine={() => ({ text: '', documentId: null })}
            columns={[
              {
                key: 'text',
                title: 'Comment',
                render: (f) => (
                  <Form.Item name={[f.name, 'text']} noStyle rules={[{ required: true, whitespace: true, message: 'Write the comment, or remove the line' }]}>
                    <Input.TextArea aria-label="Comment" autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000} />
                  </Form.Item>
                ),
              },
              {
                key: 'documentId',
                title: 'On drawing',
                width: 200,
                render: (f) => (
                  <Form.Item name={[f.name, 'documentId']} noStyle>
                    <Select aria-label="On drawing" allowClear placeholder="The whole package" style={{ width: '100%' }} options={submission.docs.map((d) => ({ value: d.documentId, label: d.docNo }))} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** Our reply to one comment: what was changed, or why not. */
export function ReplyDialog({ submission, commentId, onClose }: { submission: DesignSubmissionDetailDto; commentId: string | null; onClose: () => void }) {
  const [form] = Form.useForm<{ reply: string }>();
  const act = useDesignSubmissionAction();
  const notify = useNotify();
  const c = submission.comments.find((x) => x.id === commentId);
  useEffect(() => {
    if (c) form.setFieldsValue({ reply: c.reply ?? '' });
  }, [c, form]);
  return (
    <FormShell
      open={!!c}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={c ? `Reply to comment ${c.commentNo}` : 'Reply'}
      okText="Save reply"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/design/submissions/${submission.id}/comments/${commentId}/reply`, body: { reply: v.reply.trim() } });
        notify.saved(`Reply to comment ${c?.commentNo} saved`);
      }}
    >
      {c ? <Typography.Paragraph type="secondary">{`${c.docNo ? `${c.docNo}: ` : ''}${c.text}`}</Typography.Paragraph> : null}
      <Form form={form} layout="vertical">
        <Form.Item name="reply" label="Our reply" rules={[{ required: true, whitespace: true, message: 'Write what was done, or why not' }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={2000} placeholder="Revised on STR-210 R2: lap length 50d at the column junctions" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Withdraw a submission not yet approved, with why. */
export function WithdrawDesignDialog({ submission, open, onClose }: { submission: DesignSubmissionDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const act = useDesignSubmissionAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Withdraw ${submission.submissionNo}`}
      okText="Withdraw"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/design/submissions/${submission.id}/withdraw`, body: { note: v.note.trim() } });
        notify.saved(`${submission.submissionNo} withdrawn`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why it is withdrawn' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="The client changed the scheme; a new submission follows" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
