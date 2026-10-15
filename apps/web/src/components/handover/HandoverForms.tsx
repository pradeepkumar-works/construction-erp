'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, DefectDto, DefectPhase, DefectPriority, HandoverSummaryDto, ProjectMemberDto } from '@erp/shared';
import { DEFAULT_DLP_MONTHS, DEFECT_PHASES, DEFECT_PHASE_LABELS, DEFECT_PRIORITIES, DEFECT_PRIORITY_LABELS, dlpEnd } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const t = (v?: string) => v?.trim() || null;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', columnGap: 16 } as const;
const DATE = 'DD MMM YYYY';
const TRADES = ['Civil', 'Plaster', 'Masonry', 'Tiling', 'Painting', 'Plumbing', 'Electrical', 'Joinery', 'Waterproofing', 'Fabrication', 'Road work', 'Drainage', 'Road marking', 'Landscaping'];

/* ---------- completion ---------- */

interface HandoverValues {
  completedOn?: dayjs.Dayjs;
  certificateNo?: string;
  certificateDate?: dayjs.Dayjs | null;
  certifiedBy?: string;
  dlpMonths?: number;
  note?: string;
  scans?: AttachmentDto[];
}

/** Record or correct the completion certificate, which starts the defect liability period. */
export function HandoverFormModal({ open, summary, onClose }: { open: boolean; summary: HandoverSummaryDto; onClose: () => void }) {
  const [form] = Form.useForm<HandoverValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const h = summary.handover;
  const completedOn = Form.useWatch('completedOn', form);
  const months = Form.useWatch('dlpMonths', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      h
        ? {
            completedOn: dayjs(h.completedOn),
            certificateNo: h.certificateNo ?? undefined,
            certificateDate: h.certificateDate ? dayjs(h.certificateDate) : null,
            certifiedBy: h.certifiedBy ?? undefined,
            dlpMonths: h.dlpMonths,
            note: h.note ?? undefined,
            scans: h.attachments,
          }
        : { completedOn: dayjs(), dlpMonths: summary.defectLiabilityMonths ?? DEFAULT_DLP_MONTHS },
    );
  }, [open, h, summary.defectLiabilityMonths, form]);

  const save = useMutation({
    mutationFn: async (v: HandoverValues) =>
      (
        await api.put<HandoverSummaryDto>(`/projects/${summary.projectId}/handover`, {
          completedOn: ymd(v.completedOn),
          certificateNo: t(v.certificateNo),
          certificateDate: ymd(v.certificateDate),
          certifiedBy: t(v.certifiedBy),
          dlpMonths: v.dlpMonths,
          note: t(v.note),
          attachmentIds: v.scans?.map((a) => a.id),
        })
      ).data,
    onSuccess: (s) => {
      message.success(`Completion recorded; the defect liability period runs to ${formatDate(s.handover?.dlpEndsOn)}`);
      qc.setQueryData(['handover', summary.projectId], s);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', summary.projectId] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const ends = completedOn && typeof months === 'number' ? dlpEnd(completedOn.format('YYYY-MM-DD'), months) : null;
  return (
    <Modal open={open} title={h ? 'Edit completion' : 'Record completion'} okText="Save" onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} width={640} destroyOnHidden>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        The date on the completion certificate starts the defect liability period. The project is marked completed.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark="optional" className="handover-form">
        <div style={grid}>
          <Form.Item name="completedOn" label="Completed on" rules={[{ required: true, message: 'Pick the completion date' }]}>
            <DatePicker format={DATE} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="dlpMonths" label="Defect liability (months)" extra={ends ? `Runs to ${formatDate(ends)}` : undefined} rules={[{ required: true }]}>
            <InputNumber min={0} max={120} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="certificateNo" label="Certificate number">
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item name="certificateDate" label="Certificate date">
            <DatePicker format={DATE} style={{ width: '100%' }} />
          </Form.Item>
        </div>
        <Form.Item name="certifiedBy" label="Certified by" extra="E.g. the client's Executive Engineer">
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        <Form.Item name="scans" label="Certificate" extra="A scan or photo">
          <PhotoUpload max={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ---------- snags and defects ---------- */

export type DefectAction = { kind: 'new' } | { kind: 'edit'; defect: DefectDto } | { kind: 'fix'; defect: DefectDto } | { kind: 'close'; defect: DefectDto } | { kind: 'reopen'; defect: DefectDto };

interface DefectValues {
  phase?: DefectPhase;
  title?: string;
  location?: string;
  trade?: string;
  priority?: DefectPriority;
  assignedToId?: string | null;
  contractor?: string;
  dueDate?: dayjs.Dayjs | null;
  reportedOn?: dayjs.Dayjs | null;
  foundBy?: string;
  description?: string;
  photos?: AttachmentDto[];
  date?: dayjs.Dayjs | null;
  fixNote?: string;
  cost?: number | null;
  note?: string;
}

const TITLES: Record<DefectAction['kind'], string> = { new: 'Report a snag or defect', edit: 'Edit', fix: 'Mark fixed', close: 'Close', reopen: 'Reopen' };
const OK: Record<DefectAction['kind'], string> = { new: 'Report', edit: 'Save', fix: 'Fixed', close: 'Close it', reopen: 'Reopen' };

export function DefectFormModal({
  action,
  projectId,
  members,
  completed,
  onClose,
  onDone,
}: {
  action: DefectAction | null;
  projectId: string;
  members: ProjectMemberDto[];
  /** Completion is recorded: new entries are defects (DLP) rather than snags */
  completed: boolean;
  onClose: () => void;
  onDone?: (id: string) => void;
}) {
  const [form] = Form.useForm<DefectValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const mode = action?.kind;
  const defect = action && action.kind !== 'new' ? action.defect : null;

  useEffect(() => {
    if (!action) return;
    form.resetFields();
    const d = action.kind !== 'new' ? action.defect : null;
    if (action.kind === 'new') form.setFieldsValue({ phase: completed ? 'DEFECT' : 'SNAG', priority: 'MEDIUM', reportedOn: dayjs(), dueDate: dayjs().add(7, 'day') });
    else if (action.kind === 'edit')
      form.setFieldsValue({
        phase: d!.phase,
        title: d!.title,
        location: d!.location ?? undefined,
        trade: d!.trade ?? undefined,
        priority: d!.priority,
        assignedToId: d!.assignedToId,
        contractor: d!.contractor ?? undefined,
        dueDate: d!.dueDate ? dayjs(d!.dueDate) : null,
        reportedOn: dayjs(d!.reportedOn),
        foundBy: d!.foundBy ?? undefined,
        description: d!.description ?? undefined,
        photos: d!.attachments,
      });
    else if (action.kind === 'fix') form.setFieldsValue({ date: dayjs() });
  }, [action, completed, form]);

  const save = useMutation({
    mutationFn: async (v: DefectValues) => {
      const fields = {
        phase: v.phase,
        title: v.title?.trim(),
        location: t(v.location),
        trade: t(v.trade),
        priority: v.priority,
        assignedToId: v.assignedToId || null,
        contractor: t(v.contractor),
        dueDate: ymd(v.dueDate),
        reportedOn: ymd(v.reportedOn) ?? undefined,
        reportedByName: t(v.foundBy),
        description: t(v.description),
        attachmentIds: v.photos?.map((a) => a.id),
      };
      switch (action!.kind) {
        case 'new':
          return (await api.post<DefectDto>('/defects', { projectId, ...fields })).data;
        case 'edit':
          return (await api.patch<DefectDto>(`/defects/${defect!.id}`, fields)).data;
        case 'fix':
          return (
            await api.post<DefectDto>(`/defects/${defect!.id}/fix`, {
              fixedOn: ymd(v.date) ?? undefined,
              fixNote: t(v.fixNote) ?? undefined,
              cost: v.cost === null || v.cost === undefined ? undefined : String(v.cost),
              attachmentIds: v.photos?.map((a) => a.id),
            })
          ).data;
        case 'close':
        case 'reopen':
          return (await api.post<DefectDto>(`/defects/${defect!.id}/${action!.kind}`, { note: t(v.note) ?? undefined })).data;
      }
    },
    onSuccess: (d) => {
      const done: Record<DefectAction['kind'], string> = { new: `${d.defectNo} reported`, edit: `${d.defectNo} saved`, fix: `${d.defectNo} marked fixed`, close: `${d.defectNo} closed`, reopen: `${d.defectNo} reopened` };
      message.success(done[action!.kind]);
      qc.invalidateQueries({ queryKey: ['defects'] });
      qc.invalidateQueries({ queryKey: ['handover', projectId] });
      onDone?.(d.id);
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const full = mode === 'new' || mode === 'edit';
  return (
    <Modal open={!!action} title={mode ? TITLES[mode] : ''} okText={mode ? OK[mode] : 'Save'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} width={full ? 720 : 520} destroyOnHidden>
      {defect ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          {defect.defectNo} {defect.title}
          {defect.location ? `, ${defect.location}` : ''}
        </Typography.Paragraph>
      ) : null}
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark="optional" className="defect-form">
        {full ? (
          <>
            <Form.Item name="phase" label="Kind">
              <Segmented<DefectPhase> options={DEFECT_PHASES.map((p) => ({ value: p, label: DEFECT_PHASE_LABELS[p] }))} />
            </Form.Item>
            <Form.Item name="title" label="What is wrong" rules={[{ required: true, whitespace: true, message: 'Say what is wrong' }]}>
              <Input maxLength={200} placeholder="E.g. Toilet floor slopes away from the drain" />
            </Form.Item>
            <div style={grid}>
              <Form.Item name="location" label="Where">
                <Input maxLength={200} placeholder="Block, floor, room or chainage" />
              </Form.Item>
              <Form.Item name="trade" label="Trade">
                <AutoComplete options={TRADES.map((v) => ({ value: v }))} showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} maxLength={80} />
              </Form.Item>
              <Form.Item name="priority" label="Priority">
                <Segmented<DefectPriority> options={DEFECT_PRIORITIES.map((p) => ({ value: p, label: DEFECT_PRIORITY_LABELS[p] }))} />
              </Form.Item>
              <Form.Item name="assignedToId" label="Assigned to">
                <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Someone on the project" options={members.map((m) => ({ value: m.userId, label: `${m.fullName} (${m.roleName})` }))} />
              </Form.Item>
              <Form.Item name="contractor" label="Subcontractor" extra="When they are to put it right">
                <Input maxLength={160} />
              </Form.Item>
              <Form.Item name="dueDate" label="Put right by">
                <DatePicker format={DATE} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="reportedOn" label="Found on">
                <DatePicker format={DATE} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="foundBy" label="Found by" extra="When not one of us, e.g. the client's engineer">
                <Input maxLength={120} />
              </Form.Item>
            </div>
            <Form.Item name="description" label="Details">
              <Input.TextArea rows={2} maxLength={2000} />
            </Form.Item>
            <Form.Item name="photos" label="Photos">
              <PhotoUpload max={6} />
            </Form.Item>
          </>
        ) : null}
        {mode === 'fix' ? (
          <>
            <div style={grid}>
              <Form.Item name="date" label="Fixed on" rules={[{ required: true }]}>
                <DatePicker format={DATE} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item name="cost" label="Cost (₹)" extra="What putting it right cost">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item name="fixNote" label="What was done">
              <Input.TextArea rows={2} maxLength={2000} />
            </Form.Item>
            <Form.Item name="photos" label="Photos after">
              <PhotoUpload max={6} />
            </Form.Item>
          </>
        ) : null}
        {mode === 'close' || mode === 'reopen' ? (
          <Form.Item
            name="note"
            label={mode === 'reopen' ? 'Why it is not right yet' : 'Note'}
            rules={mode === 'close' && defect?.status === 'OPEN' ? [{ required: true, whitespace: true, message: 'Say why it is closed without being fixed' }] : undefined}
            extra={mode === 'close' && defect?.status === 'OPEN' ? 'It has not been marked fixed: say why it is closed, e.g. waived by the client' : undefined}
          >
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
