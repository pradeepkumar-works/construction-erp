'use client';

import React, { useEffect, useMemo } from 'react';
import { App, DatePicker, Form, Input, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import type { AiDraftDto, AttachmentDto, LetterDirection, LetterDto } from '@erp/shared';
import { LETTER_DIRECTION_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useLetters, useProjects, useRisks } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { inSentence } from '@/lib/format';
import { aiFlagItem } from '@/components/ai/drafts';

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

/** Record a letter received or sent, or (with `letter`) change one. `aiDraft` is a letter Ask Nirmaan wrote (AI item 71). */
export function LetterFormModal({ open, onClose, projectId, letter, prefill, aiDraft, onSaved }: { open: boolean; onClose: () => void; projectId?: string; letter?: LetterDto | null; prefill?: LetterPrefill | null; aiDraft?: AiDraftDto | null; onSaved?: (l: LetterDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!letter;
  const draft = letter ? null : aiDraft;
  const fixedProject = letter?.projectId ?? prefill?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const direction = Form.useWatch('direction', form) ?? letter?.direction;
  const party = Form.useWatch('party', form);
  const summary = Form.useWatch('summary', form);
  const { data: letters } = useLetters({ projectId: selectedProject, pageSize: 100, sortBy: 'letterDate', sortOrder: 'desc' }, open && !!selectedProject);
  const { data: delays } = useRisks({ projectId: selectedProject, pageSize: 100 }, open && !!selectedProject);

  const letterOptions = useMemo(
    () => (letters?.items ?? []).filter((l) => l.id !== letter?.id).map((l) => ({ value: l.id, label: `${l.letterNo} (${inSentence(LETTER_DIRECTION_LABELS[l.direction])}) ${l.subject}` })),
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
        ...(aiDraft
          ? {
              projectId: aiDraft.projectId,
              direction: 'OUT' as const,
              party: aiDraft.values.party as string | undefined,
              subject: aiDraft.values.subject as string | undefined,
              summary: aiDraft.values.summary as string | undefined,
              inReplyToId: aiDraft.values.inReplyToId as string | undefined,
            }
          : {}),
      });
  }, [open, projectId, letter, prefill, aiDraft, form]);

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
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={680}
      title={letter ? `Edit ${letter.letterNo}` : prefill?.inReplyToId ? 'Reply' : 'Record a letter'}
      okText={editing ? 'Save' : 'Record'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      draftKey={editing || prefill ? undefined : `letter:${projectId ?? 'any'}`}
      aiDraft={draft}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Letter">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Select project"
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
              onChange={() => form.setFieldsValue({ inReplyToId: undefined, riskId: undefined })}
            />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="direction" label="Letter" hidden={editing}>
              <Segmented options={(['IN', 'OUT'] as const).map((d) => ({ value: d, label: LETTER_DIRECTION_LABELS[d] }))} />
            </Form.Item>
            <Form.Item name="letterDate" label="Dated" rules={[{ required: true, message: 'Pick the date on the letter' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="theirRef" label={direction === 'OUT' ? 'Our reference' : 'Their reference'}>
              <Input maxLength={100} placeholder="EE/RB/2026/412" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="party" label={direction === 'OUT' ? 'To' : 'From'} rules={[{ required: true, whitespace: true, message: direction === 'OUT' ? 'Say who it goes to' : 'Say who it is from' }]} {...aiFlagItem(draft, 'party', party)}>
            <Input maxLength={200} placeholder="Executive Engineer, R&B Division" />
          </Form.Item>
          <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Enter the subject' }]}>
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="summary" label={draft ? 'Letter text' : 'Gist'} {...aiFlagItem(draft, 'summary', summary)}>
            <Input.TextArea autoSize={{ minRows: 3, maxRows: draft ? 16 : 8 }} maxLength={4000} placeholder="What it says or asks for" />
          </Form.Item>
          <Form.Item name="files" label="Scanned letter">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
        <FormSection title="Follow-up">
          <FormGrid cols={2}>
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
          </FormGrid>
          <Form.Item name="riskId" label="About a delay or risk" tooltip="Hindrance notices, extension of time claims and their replies, so the delay register shows the correspondence">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedProject} options={riskOptions} />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
