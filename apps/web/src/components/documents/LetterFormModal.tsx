'use client';

import React, { useEffect, useMemo } from 'react';
import { App, DatePicker, Form, Input, Modal, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, LetterDirection, LetterDto } from '@erp/shared';
import { LETTER_DIRECTION_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useLetters, useProjects, useRisks } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';

interface FormValues {
  projectId: string;
  direction: LetterDirection;
  letterDate: dayjs.Dayjs;
  theirRef?: string;
  party: string;
  subject: string;
  summary?: string;
  replyBy?: dayjs.Dayjs | null;
  inReplyToId?: string;
  riskId?: string;
  files?: AttachmentDto[];
}

/** A reply starts from the letter it answers. */
export interface LetterPrefill {
  projectId: string;
  direction: LetterDirection;
  party?: string;
  subject?: string;
  inReplyToId?: string;
  riskId?: string | null;
}

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

/** Record a letter received or sent, or (with `letter`) change one. */
export function LetterFormModal({ open, onClose, projectId, letter, prefill, onSaved }: { open: boolean; onClose: () => void; projectId?: string; letter?: LetterDto | null; prefill?: LetterPrefill | null; onSaved?: (l: LetterDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!letter;
  const fixedProject = letter?.projectId ?? prefill?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const direction = Form.useWatch('direction', form) ?? letter?.direction;
  const { data: letters } = useLetters({ projectId: selectedProject, pageSize: 100, sortBy: 'letterDate', sortOrder: 'desc' }, open && !!selectedProject);
  const { data: delays } = useRisks({ projectId: selectedProject, pageSize: 100 }, open && !!selectedProject);

  const letterOptions = useMemo(
    () => (letters?.items ?? []).filter((l) => l.id !== letter?.id).map((l) => ({ value: l.id, label: `${l.letterNo} (${LETTER_DIRECTION_LABELS[l.direction].toLowerCase()}) ${l.subject}` })),
    [letters, letter],
  );
  const riskOptions = useMemo(
    () => (delays?.items ?? []).map((r) => ({ value: r.id, label: `${r.riskNo} ${r.kind === 'DELAY' ? 'Delay' : 'Risk'}: ${r.title}` })),
    [delays],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (letter)
      form.setFieldsValue({
        projectId: letter.projectId,
        direction: letter.direction,
        letterDate: dayjs(letter.letterDate),
        theirRef: letter.theirRef ?? undefined,
        party: letter.party,
        subject: letter.subject,
        summary: letter.summary ?? undefined,
        replyBy: letter.replyBy ? dayjs(letter.replyBy) : null,
        inReplyToId: letter.inReplyTo?.id,
        riskId: letter.riskId ?? undefined,
        files: letter.attachments,
      });
    else
      form.setFieldsValue({
        projectId: prefill?.projectId ?? projectId,
        direction: prefill?.direction ?? 'IN',
        letterDate: dayjs(),
        party: prefill?.party,
        subject: prefill?.subject,
        inReplyToId: prefill?.inReplyToId,
        riskId: prefill?.riskId ?? undefined,
      });
  }, [open, projectId, letter, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body = {
        letterDate: v.letterDate.format('YYYY-MM-DD'),
        theirRef: t(v.theirRef),
        party: v.party.trim(),
        subject: v.subject.trim(),
        summary: t(v.summary),
        replyBy: v.direction === 'IN' && v.replyBy ? v.replyBy.format('YYYY-MM-DD') : null,
        inReplyToId: v.inReplyToId ?? null,
        riskId: v.riskId ?? null,
        attachmentIds: (v.files ?? []).map((f) => f.id),
      };
      return letter ? (await api.patch<LetterDto>(`/letters/${letter.id}`, body)).data : (await api.post<LetterDto>('/letters', { projectId: v.projectId, direction: v.direction, ...body })).data;
    },
    onSuccess: (l) => {
      message.success(editing ? `${l.letterNo} updated` : `${l.letterNo} recorded`);
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['risks'] });
      onSaved?.(l);
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={letter ? `Edit ${letter.letterNo}` : prefill?.inReplyToId ? 'Reply' : 'Record a letter'} okText={editing ? 'Save' : 'Record'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!fixedProject}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            onChange={() => form.setFieldsValue({ inReplyToId: undefined, riskId: undefined })}
          />
        </Form.Item>
        <div style={grid('1fr 1fr 1fr')}>
          <Form.Item name="direction" label="Letter" hidden={editing}>
            <Segmented options={(['IN', 'OUT'] as const).map((d) => ({ value: d, label: LETTER_DIRECTION_LABELS[d] }))} />
          </Form.Item>
          <Form.Item name="letterDate" label="Dated" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="theirRef" label={direction === 'OUT' ? 'Our reference' : 'Their reference'}>
            <Input maxLength={100} placeholder="EE/RB/2026/412" />
          </Form.Item>
        </div>
        <Form.Item name="party" label={direction === 'OUT' ? 'To' : 'From'} rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={200} placeholder="Executive Engineer, R&B Division" />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="summary" label="Gist">
          <Input.TextArea rows={3} maxLength={4000} placeholder="What it says or asks for" />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="inReplyToId" label="In reply to">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={letterOptions} />
          </Form.Item>
          {direction === 'IN' ? (
            <Form.Item name="replyBy" label="Reply needed by">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          ) : (
            <div />
          )}
        </div>
        <Form.Item name="riskId" label="About a delay or risk" tooltip="Hindrance notices, extension of time claims and their replies, so the delay register shows the correspondence">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={riskOptions} />
        </Form.Item>
        <Form.Item name="files" label="Scanned letter">
          <PhotoUpload />
        </Form.Item>
      </Form>
    </Modal>
  );
}
