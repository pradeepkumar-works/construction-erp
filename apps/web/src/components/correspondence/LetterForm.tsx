'use client';

import React, { useEffect, useMemo } from 'react';
import { AutoComplete, Checkbox, Form, Input, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation } from '@tanstack/react-query';
import type { AiDraftDto, AttachmentDto, LetterAction, LetterDirection, LetterDto, LetterMode, LetterPriority } from '@erp/shared';
import {
  DEFAULT_REPLY_DAYS,
  LETTER_ACTIONS,
  LETTER_ACTION_LABELS,
  LETTER_MODES,
  LETTER_MODE_LABELS,
  LETTER_PRIORITY_LABELS,
  canHeadLetters,
  contactLine,
  fillLetterTemplate,
  letterNeedsApproval,
  RISK_KIND_LABELS,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useLetterContacts, useLetterPeople, useLetterSettings, useLetterTemplates, useLetters, useMasterList, useProjects, useRisks } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { DatePicker } from '@/components/common/DatePicker';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { aiFlagItem } from '@/components/ai/drafts';
import { letterHref, letterLabel, useInvalidateLetters } from './letterUi';

/** The project select's value for a head office letter. */
export const HEAD_OFFICE = 'HO';

interface FormValues {
  projectId: string;
  letterDate?: dayjs.Dayjs;
  receivedOn?: dayjs.Dayjs;
  theirRef?: string;
  party: string;
  contactId?: string | null;
  subject: string;
  summary?: string;
  body?: string;
  category?: string | null;
  priority: LetterPriority;
  confidential?: boolean;
  mode?: LetterMode | null;
  replyBy?: dayjs.Dayjs | null;
  inReplyToId?: string | null;
  riskId?: string | null;
  signatoryId?: string | null;
  markToId?: string | null;
  action?: LetterAction | null;
  actionDue?: dayjs.Dayjs | null;
  alreadySent?: boolean;
  files?: AttachmentDto[];
}

/** A reply or a letter started from somewhere else (a delay, a bill) begins from what it knows. */
export interface LetterPrefill {
  projectId?: string | null;
  party?: string;
  contactId?: string | null;
  subject?: string;
  inReplyToId?: string;
  riskId?: string | null;
  category?: string | null;
  /** The letter answered: its reference and date fill a template */
  theirRef?: string | null;
  theirDate?: string | null;
}

const ymd = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);

/**
 * Record a letter received (numbered at once from its series, and marked to someone) or start one to send (a draft,
 * numbered when its signatory approves it or, where it needs no approval, when it is issued). With `letter`, change one.
 * `aiDraft` is a letter Ask Nirmaan wrote (AI item 71), from a delay's notice or a bill's reminder too.
 */
export function LetterForm({
  open,
  onClose,
  direction,
  projectId,
  letter,
  prefill,
  aiDraft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  direction: LetterDirection;
  projectId?: string;
  letter?: LetterDto | null;
  prefill?: LetterPrefill | null;
  aiDraft?: AiDraftDto | null;
  onSaved?: (l: LetterDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { user } = useAuth();
  const notify = useNotify();
  const invalidate = useInvalidateLetters();
  const editing = !!letter;
  const isIn = (letter?.direction ?? direction) === 'IN';
  const draft = letter ? null : aiDraft;
  const head = !!user && canHeadLetters(user.roleKey);
  const fixedProject = letter ? (letter.projectId ?? HEAD_OFFICE) : (prefill?.projectId ?? projectId);

  const chosen = Form.useWatch('projectId', form) ?? fixedProject;
  const project = chosen && chosen !== HEAD_OFFICE ? chosen : undefined;
  const category = Form.useWatch('category', form);
  const alreadySent = Form.useWatch('alreadySent', form);
  const markToId = Form.useWatch('markToId', form);
  const party = Form.useWatch('party', form);
  const body = Form.useWatch('body', form);

  const { data: projects } = useProjects();
  const { data: contacts } = useLetterContacts(false, open);
  const { data: people } = useLetterPeople(project, open && !!chosen);
  const { data: settings } = useLetterSettings(open && !isIn);
  const { data: templates } = useLetterTemplates(open && !isIn && !editing);
  const { data: categories } = useMasterList('letter-category', false, open);
  const { data: letters } = useLetters({ projectId: chosen, direction: isIn ? 'OUT' : 'IN', pageSize: 100, sortBy: 'letterDate', sortOrder: 'desc' }, open && !!chosen);
  const { data: delays } = useRisks({ projectId: project, pageSize: 100 }, open && !!project);

  const contactOptions = useMemo(() => (contacts ?? []).map((c) => ({ value: contactLine(c), label: contactLine(c), id: c.id })), [contacts]);
  const projectOptions = useMemo(
    () => [...(head || chosen === HEAD_OFFICE ? [{ value: HEAD_OFFICE, label: 'Head office (no project)' }] : []), ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))],
    [projects, head, chosen],
  );
  const letterOptions = useMemo(
    () => (letters?.items ?? []).filter((l) => l.id !== letter?.id).map((l) => ({ value: l.id, label: `${letterLabel(l)} · ${formatDate(l.letterDate)} · ${l.subject}` })),
    [letters, letter],
  );
  const riskOptions = useMemo(() => (delays?.items ?? []).map((r) => ({ value: r.id, label: `${r.riskNo} ${RISK_KIND_LABELS[r.kind]}: ${r.title}` })), [delays]);
  const signatories = (people ?? []).filter((p) => p.canSign);
  const needsApproval = !!settings && letterNeedsApproval(settings.approval, category);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (letter) {
      form.setFieldsValue({
        projectId: letter.projectId ?? HEAD_OFFICE,
        letterDate: dayjs(letter.letterDate),
        receivedOn: letter.receivedOn ? dayjs(letter.receivedOn) : undefined,
        theirRef: letter.theirRef ?? undefined,
        party: letter.party,
        contactId: letter.contactId,
        subject: letter.subject,
        summary: letter.summary ?? undefined,
        body: letter.body ?? undefined,
        category: letter.category,
        priority: letter.priority,
        confidential: letter.confidential,
        mode: letter.mode,
        replyBy: letter.replyBy ? dayjs(letter.replyBy) : null,
        inReplyToId: letter.inReplyTo?.id ?? null,
        riskId: letter.riskId,
        signatoryId: letter.signatoryId,
        files: letter.attachments,
      });
      return;
    }
    const today = dayjs();
    form.setFieldsValue({
      projectId: prefill?.projectId === null ? HEAD_OFFICE : (prefill?.projectId ?? projectId),
      priority: 'NORMAL',
      letterDate: today,
      receivedOn: isIn ? today : undefined,
      party: prefill?.party,
      contactId: prefill?.contactId ?? null,
      subject: prefill?.subject,
      inReplyToId: prefill?.inReplyToId ?? null,
      riskId: prefill?.riskId ?? null,
      category: prefill?.category ?? null,
      ...(aiDraft
        ? {
            projectId: aiDraft.projectId ?? HEAD_OFFICE,
            party: aiDraft.values.party as string | undefined,
            subject: aiDraft.values.subject as string | undefined,
            body: aiDraft.values.body as string | undefined,
            category: (aiDraft.values.category as string | undefined) ?? prefill?.category ?? null,
            inReplyToId: (aiDraft.values.inReplyToId as string | undefined) ?? null,
            riskId: (aiDraft.values.riskId as string | undefined) ?? prefill?.riskId ?? null,
          }
        : {}),
    });
  }, [open, projectId, letter, prefill, aiDraft, isIn, form]);

  // A new draft's signatory: the project's own manager where there is one who may sign, else the only one offered.
  useEffect(() => {
    if (!open || editing || isIn || !people || form.getFieldValue('signatoryId')) return;
    const own = signatories.find((p) => p.onProject) ?? (signatories.length === 1 ? signatories[0] : undefined);
    if (own) form.setFieldValue('signatoryId', own.id);
  }, [open, editing, isIn, people, signatories, form]);

  const applyTemplate = (id: string) => {
    const t = templates?.find((x) => x.id === id);
    if (!t) return;
    const p = projects?.find((x) => x.id === project);
    const contact = contacts?.find((c) => c.id === form.getFieldValue('contactId'));
    const values = {
      to: contact?.name ?? form.getFieldValue('party'),
      office: contact?.office,
      project: p?.name,
      theirRef: prefill?.theirRef,
      theirDate: prefill?.theirDate ? formatDate(prefill.theirDate) : null,
      subject: prefill?.subject?.replace(/^Re:\s*/, '') ?? form.getFieldValue('subject'),
      date: formatDate(dayjs().format('YYYY-MM-DD')),
    };
    form.setFieldsValue({ subject: fillLetterTemplate(t.subject, values), body: fillLetterTemplate(t.body, values), category: form.getFieldValue('category') ?? t.category });
  };

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || null;
      const common = {
        projectId: v.projectId === HEAD_OFFICE ? null : v.projectId,
        theirRef: t(v.theirRef),
        party: v.party.trim(),
        contactId: v.contactId ?? null,
        subject: v.subject.trim(),
        category: v.category ?? null,
        priority: v.priority,
        confidential: !!v.confidential,
        replyBy: ymd(v.replyBy),
        inReplyToId: v.inReplyToId ?? null,
        riskId: v.riskId ?? null,
        attachmentIds: (v.files ?? []).map((f) => f.id),
      };
      const dto = isIn
        ? { ...common, letterDate: ymd(v.letterDate), receivedOn: ymd(v.receivedOn), summary: t(v.summary), mode: v.mode ?? null }
        : { ...common, letterDate: ymd(v.alreadySent || editing ? v.letterDate : dayjs()), body: v.body ?? null, summary: t(v.summary), signatoryId: v.signatoryId ?? null };
      if (letter) return (await api.patch<LetterDto>(`/letters/${letter.id}`, dto)).data;
      const extra = isIn ? { markToId: v.markToId ?? null, action: v.markToId ? (v.action ?? 'REPLY') : null, actionDue: v.markToId ? ymd(v.actionDue) : null } : { alreadySent: !!v.alreadySent };
      return (await api.post<LetterDto>('/letters', { direction: isIn ? 'IN' : 'OUT', ...dto, ...extra })).data;
    },
    onSuccess: (l) => {
      invalidate();
      notify.saved(editing ? `${letterLabel(l)} saved` : l.direction === 'IN' ? `${l.letterNo} recorded` : l.letterNo ? `${l.letterNo} issued` : 'Draft letter saved', letterHref(l.id));
      onSaved?.(l);
    },
    meta: FAIL_NOTICE,
  });

  const title = editing ? `Edit ${letterLabel(letter!)}` : isIn ? 'Record inward letter' : prefill?.inReplyToId ? 'Reply' : 'New letter';
  const okText = editing ? 'Save' : isIn ? 'Record' : alreadySent ? 'Record as sent' : 'Save draft';
  const today = dayjs();

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={720}
      title={title}
      okText={okText}
      onSubmit={(v) => save.mutateAsync(v)}
      draftKey={editing || prefill ? undefined : `letter-${isIn ? 'in' : 'out'}:${projectId ?? 'any'}`}
      aiDraft={draft}
    >
      <Form form={form} layout="vertical" initialValues={{ priority: 'NORMAL' }}>
        <FormSection title="Letter">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project, or head office' }]} hidden={!!fixedProject}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Choose the project"
              options={projectOptions}
              onChange={() => form.setFieldsValue({ inReplyToId: null, riskId: null, signatoryId: null, markToId: null })}
            />
          </Form.Item>
          <Form.Item name="contactId" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="party"
            label={isIn ? 'From' : 'To'}
            rules={[{ required: true, whitespace: true, message: isIn ? 'Say who it is from' : 'Say who it goes to' }]}
            extra={contactOptions.length ? 'Pick from the address book, or type a new one' : undefined}
            {...aiFlagItem(draft, 'party', party)}
          >
            <AutoComplete
              options={contactOptions}
              showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
              onSelect={(_, o) => form.setFieldValue('contactId', (o as { id: string }).id)}
              onChange={(v) => {
                if (!contactOptions.some((o) => o.value === v)) form.setFieldValue('contactId', null);
              }}
              placeholder="The Executive Engineer, R&B Division"
              maxLength={300}
            />
          </Form.Item>
          <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Enter the subject' }]}>
            <Input maxLength={300} />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="category" label="Category" tooltip="Notices, claims, extension of time, hindrance and replies to show cause are contractual">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="General" options={(categories?.entries ?? []).filter((e) => e.isActive || e.code === category).map((e) => ({ value: e.code, label: e.name }))} />
            </Form.Item>
            <Form.Item name="priority" label="Priority">
              <Segmented
                options={(['NORMAL', 'URGENT'] as const).map((p) => ({ value: p, label: LETTER_PRIORITY_LABELS[p] }))}
                onChange={(p) => {
                  if (isIn && !editing && !form.isFieldTouched('replyBy') && form.getFieldValue('replyBy')) form.setFieldValue('replyBy', (form.getFieldValue('receivedOn') ?? today).add(DEFAULT_REPLY_DAYS[p as LetterPriority], 'day'));
                }}
              />
            </Form.Item>
            <Form.Item name="confidential" label="Confidential" valuePropName="checked" tooltip="Only the correspondence heads and whoever it is marked to see it">
              <Checkbox>Mark as confidential</Checkbox>
            </Form.Item>
          </FormGrid>
          {isIn ? (
            <>
              <FormGrid cols={3}>
                <Form.Item name="theirRef" label="Their reference">
                  <Input maxLength={100} placeholder="EE/RB/2026/412" />
                </Form.Item>
                <Form.Item name="letterDate" label="Dated" rules={[{ required: true, message: 'Pick the date on the letter' }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(today, 'day')} />
                </Form.Item>
                <Form.Item name="receivedOn" label="Received on" rules={[{ required: true, message: 'Pick the day it reached you' }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(today, 'day')} />
                </Form.Item>
              </FormGrid>
              <Form.Item name="mode" label="Came by">
                <Select allowClear options={LETTER_MODES.map((m) => ({ value: m, label: LETTER_MODE_LABELS[m] }))} />
              </Form.Item>
              <Form.Item name="summary" label="Gist">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} maxLength={4000} placeholder="What it says or asks for" />
              </Form.Item>
              <Form.Item name="files" label="Scanned letter">
                <PhotoUpload />
              </Form.Item>
            </>
          ) : (
            <>
              {!editing && templates?.length ? (
                <Form.Item label="Start from a template">
                  <Select allowClear placeholder="Choose a template" aria-label="Start from a template" onChange={(id) => id && applyTemplate(id)} options={templates.filter((t) => t.isActive).map((t) => ({ value: t.id, label: t.name }))} />
                </Form.Item>
              ) : null}
              <Form.Item name="body" label="Letter text" {...aiFlagItem(draft, 'body', body)}>
                <Input.TextArea autoSize={{ minRows: 6, maxRows: 20 }} maxLength={20000} placeholder="With reference to your letter… we submit as under." />
              </Form.Item>
              <Form.Item name="files" label="Enclosures">
                <PhotoUpload />
              </Form.Item>
            </>
          )}
        </FormSection>
        {isIn ? (
          <FormSection title="Who acts on it">
            <FormGrid cols={2}>
              <Form.Item name="replyBy" label="Reply needed by">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <div />
            </FormGrid>
            {!editing ? (
              <FormGrid cols={3}>
                <Form.Item name="markToId" label="Mark to">
                  <Select
                    allowClear
                    showSearch={{ optionFilterProp: 'label' }}
                    disabled={!chosen}
                    placeholder="Mark it later"
                    options={(people ?? []).map((p) => ({ value: p.id, label: `${p.fullName} · ${p.roleName}` }))}
                    onChange={(v) => {
                      if (v && !form.getFieldValue('action')) form.setFieldsValue({ action: 'REPLY', actionDue: form.getFieldValue('replyBy') ?? null });
                    }}
                  />
                </Form.Item>
                <Form.Item name="action" label="Action" hidden={!markToId}>
                  <Select options={LETTER_ACTIONS.map((a) => ({ value: a, label: LETTER_ACTION_LABELS[a] }))} />
                </Form.Item>
                <Form.Item name="actionDue" label="Due by" hidden={!markToId}>
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </FormGrid>
            ) : null}
          </FormSection>
        ) : (
          <FormSection title="Signing and sending">
            <FormGrid cols={2}>
              <Form.Item
                name="signatoryId"
                label="Signed by"
                rules={[{ required: needsApproval && !alreadySent, message: 'Choose who signs it' }]}
                extra={needsApproval ? 'This kind of letter is approved by its signatory before it gets its number' : undefined}
              >
                <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!chosen} options={signatories.map((p) => ({ value: p.id, label: `${p.fullName} · ${p.roleName}` }))} />
              </Form.Item>
              <Form.Item name="replyBy" label="Their reply expected by">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </FormGrid>
            {!editing ? (
              <FormGrid cols={2}>
                <Form.Item name="alreadySent" valuePropName="checked" label="Already sent">
                  <Checkbox>Signed and sent outside Nirmaan: number it now</Checkbox>
                </Form.Item>
                {alreadySent ? (
                  <Form.Item name="letterDate" label="Dated" rules={[{ required: true, message: 'Pick the date on the letter' }]}>
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(today, 'day')} />
                  </Form.Item>
                ) : (
                  <div />
                )}
              </FormGrid>
            ) : null}
          </FormSection>
        )}
        <FormSection title="Linked to">
          <FormGrid cols={2}>
            <Form.Item name="inReplyToId" label="In reply to">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!chosen} options={letterOptions} />
            </Form.Item>
            <Form.Item name="riskId" label="About a delay or risk" tooltip="Hindrance notices, extension of time claims and their replies, so the delay register shows the correspondence">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!project} options={riskOptions} />
            </Form.Item>
          </FormGrid>
        </FormSection>
      </Form>
    </FormShell>
  );
}
