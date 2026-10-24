'use client';

import React, { useEffect, useRef } from 'react';
import { DatePicker, Form, Input, Segmented, Select, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import {
  MATERIAL_APPROVAL_KIND_LABELS,
  MATERIAL_APPROVAL_KINDS,
  MATERIAL_APPROVAL_STATUS_LABELS,
  MATERIAL_REVIEW_OUTCOME_LABELS,
  MATERIAL_REVIEW_OUTCOMES,
  revisionLabel,
  type ApprovedMakeDto,
  type AttachmentDto,
  type MaterialApprovalDetailDto,
  type MaterialApprovalKind,
  type MaterialApprovalStatus,
  type MaterialReviewOutcome,
} from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useBoq, useMaterialApprovalAction, useProjects } from '@/lib/queries';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { ItemSelect, VendorSelect } from '@/components/common/SearchSelect';
import { PhotoUpload } from '@/components/common/PhotoUpload';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const notAfterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');

const STATUS_COLORS: Record<MaterialApprovalStatus, string | undefined> = {
  DRAFT: undefined,
  UNDER_REVIEW: 'processing',
  APPROVED: 'success',
  APPROVED_AS_NOTED: 'success',
  REVISE_RESUBMIT: 'warning',
  REJECTED: 'error',
  WITHDRAWN: undefined,
};
export function MaterialApprovalStatusTag({ status, overdue }: { status: MaterialApprovalStatus; overdue?: boolean }) {
  if (status === 'UNDER_REVIEW' && overdue) return <AppTag tone="danger">Reply overdue</AppTag>;
  return <AppTag color={STATUS_COLORS[status]}>{MATERIAL_APPROVAL_STATUS_LABELS[status]}</AppTag>;
}

const OUTCOME_COLORS: Record<MaterialReviewOutcome, string> = { APPROVED: 'success', APPROVED_AS_NOTED: 'success', REVISE_RESUBMIT: 'warning', REJECTED: 'error' };
export function OutcomeTag({ outcome }: { outcome: MaterialReviewOutcome }) {
  return <AppTag color={OUTCOME_COLORS[outcome]}>{MATERIAL_REVIEW_OUTCOME_LABELS[outcome]}</AppTag>;
}

interface ApprovalValues {
  projectId?: string;
  kind: MaterialApprovalKind;
  material: string;
  itemId?: string | null;
  boqItemId?: string | null;
  make: string;
  model?: string | null;
  vendorId?: string | null;
  usedFor?: string | null;
  note?: string | null;
  toParty: string;
  replyBy?: dayjs.Dayjs | null;
  files?: AttachmentDto[];
}

/** Raise a request for a make or a sample, or change a draft. It stays a draft until it is submitted. */
export function MaterialApprovalForm({ open, onClose, approval, onSaved }: { open: boolean; onClose: () => void; approval?: MaterialApprovalDetailDto | null; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<ApprovalValues>();
  const act = useMaterialApprovalAction();
  const notify = useNotify();
  const saved = useRef<string | null>(null);
  const { data: projects } = useProjects(open);
  const projectId = Form.useWatch('projectId', form) ?? approval?.projectId;
  const { data: boq } = useBoq(open ? projectId : undefined);

  useEffect(() => {
    if (!open) return;
    if (approval)
      form.setFieldsValue({
        projectId: approval.projectId,
        kind: approval.kind,
        material: approval.material,
        itemId: approval.itemId,
        boqItemId: approval.boqItemId,
        make: approval.make,
        model: approval.model,
        vendorId: approval.vendorId,
        usedFor: approval.usedFor,
        note: approval.note,
        toParty: approval.toParty,
        replyBy: approval.replyBy ? dayjs(approval.replyBy) : null,
        files: approval.attachments,
      });
    else form.setFieldsValue({ kind: 'MATERIAL', files: [] });
  }, [open, approval, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      title={approval ? `Edit ${approval.marNo}` : 'Request material approval'}
      okText={approval ? 'Save' : 'Save draft'}
      draftKey={approval ? undefined : 'material-approval:new'}
      onSubmit={async (v) => {
        const body = {
          kind: v.kind,
          material: v.material.trim(),
          itemId: v.itemId ?? null,
          boqItemId: v.boqItemId ?? null,
          make: v.make.trim(),
          model: v.model?.trim() || null,
          vendorId: v.vendorId ?? null,
          usedFor: v.usedFor?.trim() || null,
          note: v.note?.trim() || null,
          toParty: v.toParty.trim(),
          replyBy: ymd(v.replyBy),
          attachmentIds: (v.files ?? []).map((f) => f.id),
        };
        const row = approval
          ? await act.mutateAsync({ method: 'patch', path: `/material-approvals/${approval.id}`, body })
          : await act.mutateAsync({ path: '/material-approvals', body: { ...body, projectId: v.projectId } });
        saved.current = row.id;
        notify.saved(approval ? `${approval.marNo} saved` : `Request ${row.marNo} saved as a draft`);
        if (!approval && onSaved) afterFormLeaves(() => saved.current && onSaved(saved.current));
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="What is to be approved">
          <FormGrid cols={2}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!!approval}
                onChange={() => form.setFieldValue('boqItemId', null)}
                options={(projects ?? []).filter((p) => p.type !== 'STORE').map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              />
            </Form.Item>
            <Form.Item name="kind" label="Request for">
              <Segmented options={MATERIAL_APPROVAL_KINDS.map((k) => ({ value: k, label: k === 'MATERIAL' ? 'A make' : 'A sample' }))} />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="material" label="Material" rules={[{ required: true, whitespace: true, message: 'Name the material' }]}>
              <Input maxLength={200} placeholder="Vitrified floor tiles 600 x 600" />
            </Form.Item>
            <Form.Item name="itemId" label="Item on the item master" extra="Order lines for this item are checked against the approved makes.">
              <ItemSelect
                allowClear
                onPick={(item) => {
                  if (!form.getFieldValue('material')?.trim()) form.setFieldValue('material', item.name);
                }}
              />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="make" label="Make" rules={[{ required: true, whitespace: true, message: 'Name the make' }]}>
              <Input maxLength={120} placeholder="Kajaria" translate="no" />
            </Form.Item>
            <Form.Item name="model" label="Model, grade or range">
              <Input maxLength={200} placeholder="Eternity series, matt" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="boqItemId" label="BOQ item">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!projectId}
                placeholder={projectId ? 'Where it is used in the BOQ' : 'Choose the project first'}
                options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}` }))}
              />
            </Form.Item>
            <Form.Item name="vendorId" label="Supplier">
              <VendorSelect allowClear kinds={['SUPPLIER']} placeholder="Who offers it" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="usedFor" label="Used for">
            <Input maxLength={300} placeholder="Wards and corridors, all floors" />
          </Form.Item>
          <Form.Item name="note" label="Why this make">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} placeholder="Meets clause 6.4 of the specification and IS 15622; equal to the listed makes" />
          </Form.Item>
        </FormSection>
        <FormSection title="Who it goes to">
          <FormGrid cols={2}>
            <Form.Item name="toParty" label="To" rules={[{ required: true, whitespace: true, message: 'Say who it goes to' }]}>
              <Input maxLength={200} placeholder="Engineer-in-charge or the consultant" />
            </Form.Item>
            <Form.Item name="replyBy" label="Reply asked by">
              <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="files" label="Catalogue, test certificates and photos">
            <PhotoUpload drawings max={10} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** Send the request to the reviewer: R0 from a draft, or the next revision after revise or reject, perhaps with another make. */
export function SubmitDialog({ approval, open, onClose }: { approval: MaterialApprovalDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ submittedOn: dayjs.Dayjs; replyBy?: dayjs.Dayjs | null; note?: string; make?: string; model?: string | null; files?: AttachmentDto[] }>();
  const act = useMaterialApprovalAction();
  const notify = useNotify();
  const again = approval.status !== 'DRAFT';
  const next = again ? approval.revision + 1 : 0;
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        submittedOn: dayjs(),
        replyBy: again ? null : approval.replyBy ? dayjs(approval.replyBy) : null,
        note: undefined,
        make: approval.make,
        model: approval.model,
        files: approval.attachments,
      });
  }, [open, approval, again, form]);
  const last = approval.revisions[0];
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={again ? `Resubmit as ${revisionLabel(next)}` : 'Submit for approval'}
      okText={again ? 'Resubmit' : 'Submit'}
      onSubmit={async (v) => {
        await act.mutateAsync({
          path: `/material-approvals/${approval.id}/submit`,
          body: {
            submittedOn: ymd(v.submittedOn),
            replyBy: ymd(v.replyBy),
            note: v.note?.trim() || null,
            ...(again ? { make: v.make?.trim(), model: v.model?.trim() || null } : {}),
            attachmentIds: (v.files ?? []).map((f) => f.id),
          },
        });
        notify.saved(`${approval.marNo} ${revisionLabel(next)} sent to ${approval.toParty}`);
      }}
    >
      {again && last?.comments ? (
        <Typography.Paragraph type="secondary">
          {`${revisionLabel(last.revision)} came back: “${last.comments}”`}
        </Typography.Paragraph>
      ) : null}
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="submittedOn" label="Submitted on" rules={[{ required: true, message: 'Choose the day it was submitted' }]}>
            <DatePicker format="DD MMM YYYY" disabledDate={notAfterToday} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="replyBy" label="Reply asked by">
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        {again ? (
          <FormGrid cols={2}>
            <Form.Item name="make" label="Make" rules={[{ required: true, whitespace: true, message: 'Name the make' }]}>
              <Input maxLength={120} translate="no" />
            </Form.Item>
            <Form.Item name="model" label="Model, grade or range">
              <Input maxLength={200} />
            </Form.Item>
          </FormGrid>
        ) : null}
        <Form.Item name="note" label={again ? 'What changed' : 'Covering note'}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} placeholder={again ? 'Lighter shade, with the water absorption test certificate' : 'Catalogue and two sample tiles left at the PMC office'} />
        </Form.Item>
        <Form.Item name="files" label="Files">
          <PhotoUpload drawings max={10} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The reviewer's answer to the current revision, from their letter or mail. */
export function ReviewDialog({ approval, open, onClose }: { approval: MaterialApprovalDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ outcome: MaterialReviewOutcome; reviewedOn: dayjs.Dayjs; reviewerName?: string; comments?: string; reviewRef?: string }>();
  const act = useMaterialApprovalAction();
  const notify = useNotify();
  const outcome = Form.useWatch('outcome', form);
  const submittedOn = approval.revisions.find((r) => r.revision === approval.revision)?.submittedOn ?? approval.submittedOn;
  useEffect(() => {
    if (open) form.setFieldsValue({ outcome: undefined, reviewedOn: dayjs(), reviewerName: undefined, comments: undefined, reviewRef: undefined });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Record the outcome of ${revisionLabel(approval.revision)}`}
      okText="Record"
      onSubmit={async (v) => {
        await act.mutateAsync({
          path: `/material-approvals/${approval.id}/review`,
          body: { outcome: v.outcome, reviewedOn: ymd(v.reviewedOn), reviewerName: v.reviewerName?.trim() || null, comments: v.comments?.trim() || null, reviewRef: v.reviewRef?.trim() || null },
        });
        notify.saved(
          v.outcome === 'APPROVED' || v.outcome === 'APPROVED_AS_NOTED' ? `${approval.make} is now an approved make on ${approval.projectCode}` : `${approval.marNo}: ${MATERIAL_REVIEW_OUTCOME_LABELS[v.outcome].toLowerCase()}`,
        );
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="outcome" label="Outcome" rules={[{ required: true, message: 'Choose what the reviewer decided' }]}>
          <Select options={MATERIAL_REVIEW_OUTCOMES.map((o) => ({ value: o, label: MATERIAL_REVIEW_OUTCOME_LABELS[o] }))} placeholder="What the reviewer decided" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="reviewedOn" label="Reviewed on" rules={[{ required: true, message: 'Choose the day of the review' }]}>
            <DatePicker format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || (!!submittedOn && d.isBefore(dayjs(submittedOn), 'day'))} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reviewRef" label="Letter or mail reference">
            <Input maxLength={120} placeholder="PMC/MA/031" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="reviewerName" label="Reviewed by">
          <Input maxLength={120} placeholder={approval.toParty} />
        </Form.Item>
        <Form.Item
          name="comments"
          label="Reviewer’s comments"
          rules={[{ required: !!outcome && outcome !== 'APPROVED', whitespace: true, message: 'Write the reviewer’s comments' }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} placeholder={outcome === 'APPROVED_AS_NOTED' ? 'Approved in the matt finish only' : 'What the reviewer asked for'} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Withdraw a request still in play, with why. */
export function WithdrawDialog({ approval, open, onClose }: { approval: MaterialApprovalDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const act = useMaterialApprovalAction();
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
      title={`Withdraw ${approval.marNo}`}
      okText="Withdraw"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/material-approvals/${approval.id}/withdraw`, body: { note: v.note.trim() } });
        notify.saved(`${approval.marNo} withdrawn`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why it is withdrawn' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="A listed make is now available from the depot" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A make the contract lists as approved for a material. */
export function ApprovedMakeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ projectId: string; material: string; itemId?: string | null; make: string; model?: string; note?: string }>();
  const act = useMaterialApprovalAction<ApprovedMakeDto>();
  const notify = useNotify();
  const { data: projects } = useProjects(open);
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title="Add a make from the contract"
      okText="Add"
      onSubmit={async (v) => {
        const row = await act.mutateAsync({
          path: '/material-approvals/makes',
          body: { projectId: v.projectId, material: v.material.trim(), itemId: v.itemId ?? null, make: v.make.trim(), model: v.model?.trim() || null, note: v.note?.trim() || null },
        });
        notify.saved(`${row.make} added for ${row.material}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} options={(projects ?? []).filter((p) => p.type !== 'STORE').map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="material" label="Material" rules={[{ required: true, whitespace: true, message: 'Name the material' }]}>
            <Input maxLength={200} placeholder="Cement OPC 53 grade" />
          </Form.Item>
          <Form.Item name="itemId" label="Item on the item master">
            <ItemSelect
              allowClear
              onPick={(item) => {
                if (!form.getFieldValue('material')?.trim()) form.setFieldValue('material', item.name);
              }}
            />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="make" label="Make" rules={[{ required: true, whitespace: true, message: 'Name the make' }]}>
            <Input maxLength={120} placeholder="UltraTech" translate="no" />
          </Form.Item>
          <Form.Item name="model" label="Model or grade">
            <Input maxLength={200} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Where the contract lists it">
          <Input maxLength={300} placeholder="Contract, Annexure 4" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

export const kindLabel = (k: MaterialApprovalKind) => MATERIAL_APPROVAL_KIND_LABELS[k];
