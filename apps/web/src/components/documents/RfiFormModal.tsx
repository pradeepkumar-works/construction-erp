'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect, useRef } from 'react';
import { App, Checkbox, Form, Input, Segmented, Select, Space, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { AttachmentDto, RfiDto, RfiPriority } from '@erp/shared';
import { RFI_PRIORITIES, RFI_PRIORITY_LABELS, rfiReplyBy } from '@erp/shared';
import { useBoq, useCreateRfi, useDocuments, useProjects, useUpdateRfi } from '@/lib/queries';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';

interface FormValues {
  projectId: string;
  subject: string;
  question: string;
  proposal?: string;
  location?: string;
  priority: RfiPriority;
  toParty?: string;
  raisedOn: dayjs.Dayjs;
  replyBy: dayjs.Dayjs;
  documentId?: string;
  boqItemId?: string;
  impacts: ('cost' | 'time')[];
  files?: AttachmentDto[];
}

/** Raise an RFI, or (with `rfi`) change one still waiting for its answer. `defaults` fills a new one (a mark on a drawing). */
export function RfiFormModal({
  open,
  onClose,
  projectId,
  rfi,
  defaultDocumentId,
  defaults,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  rfi?: RfiDto | null;
  defaultDocumentId?: string;
  defaults?: { subject?: string; question?: string; location?: string };
  onSaved?: (r: RfiDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const create = useCreateRfi();
  const update = useUpdateRfi();
  const { data: projects } = useProjects();
  const editing = !!rfi;
  const fixedProject = rfi?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: docs } = useDocuments({ projectId: selectedProject, pageSize: 200 }, open && !!selectedProject);
  const { data: boq } = useBoq(open ? selectedProject : undefined);
  const project = projects?.find((p) => p.id === selectedProject);
  // One id per new RFI, so a save that timed out but arrived makes no second one when tried again.
  const clientId = useRef('');
  // The answer-by date follows the raised date and priority until someone picks one.
  const replyTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    replyTouched.current = !!rfi;
    clientId.current = crypto.randomUUID();
    if (rfi)
      form.setFieldsValue({
        projectId: rfi.projectId,
        subject: rfi.subject,
        question: rfi.question,
        proposal: rfi.proposal ?? undefined,
        location: rfi.location ?? undefined,
        priority: rfi.priority,
        toParty: rfi.toParty,
        raisedOn: dayjs(rfi.raisedOn),
        replyBy: dayjs(rfi.replyBy),
        documentId: rfi.documentId ?? undefined,
        boqItemId: rfi.boqItemId ?? undefined,
        impacts: [...(rfi.costImpact ? (['cost'] as const) : []), ...(rfi.timeImpact ? (['time'] as const) : [])],
        files: rfi.attachments,
      });
    else {
      const today = dayjs().format('YYYY-MM-DD');
      form.setFieldsValue({ projectId: fixedProject, priority: 'NORMAL', raisedOn: dayjs(today), replyBy: dayjs(rfiReplyBy(today, 'NORMAL')), documentId: defaultDocumentId, impacts: [], ...defaults });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are read when the form opens, not followed
  }, [open, rfi, fixedProject, defaultDocumentId, form]);

  const followReplyBy = () => {
    if (replyTouched.current) return;
    const raised = form.getFieldValue('raisedOn') as dayjs.Dayjs | undefined;
    const priority = (form.getFieldValue('priority') as RfiPriority | undefined) ?? 'NORMAL';
    if (raised) form.setFieldValue('replyBy', dayjs(rfiReplyBy(raised.format('YYYY-MM-DD'), priority)));
  };

  const submit = async (v: FormValues) => {
    const body = {
      subject: v.subject.trim(),
      question: v.question.trim(),
      proposal: v.proposal?.trim() || null,
      location: v.location?.trim() || null,
      priority: v.priority,
      replyBy: v.replyBy.format('YYYY-MM-DD'),
      documentId: v.documentId ?? null,
      boqItemId: v.boqItemId ?? null,
      costImpact: v.impacts.includes('cost'),
      timeImpact: v.impacts.includes('time'),
      attachmentIds: (v.files ?? []).map((f) => f.id),
    };
    if (rfi) {
      const r = await update.mutateAsync({ rfiId: rfi.id, ...body, toParty: v.toParty?.trim() || rfi.toParty });
      message.success(`${r.rfiNo} saved`);
      onSaved?.(r);
    } else {
      const r = await create.mutateAsync({ id: clientId.current, projectId: v.projectId, raisedOn: v.raisedOn.format('YYYY-MM-DD'), toParty: v.toParty?.trim() || null, ...body });
      message.success(`${r.rfiNo} raised and sent to ${r.toParty}`);
      onSaved?.(r);
    }
  };

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={760} title={rfi ? `Edit ${rfi.rfiNo}` : 'New RFI'} okText={editing ? 'Save' : 'Raise RFI'} onSubmit={submit} draftKey={editing || defaults ? undefined : `rfi:${projectId ?? 'any'}`}>
      <Form form={form} layout="vertical">
        <FormSection title="Question">
          {!fixedProject ? (
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <ProjectSelect allowClear={false} placeholder="Choose a project" style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Say in a line what the question is about' }]}>
            <Input maxLength={200} placeholder="e.g. Footing F12 level differs between drawings" />
          </Form.Item>
          <Form.Item name="question" label="Question" rules={[{ required: true, whitespace: true, message: 'Write the question to the client or consultant' }]} extra="What you found at site, what the drawings or specification say, and what you need to know.">
            <Input.TextArea rows={4} maxLength={4000} showCount />
          </Form.Item>
          <Form.Item name="proposal" label="Our proposal" extra="What you suggest, so they can simply agree.">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <FormGrid>
            <Form.Item name="location" label="Location">
              <Input maxLength={200} placeholder="Grid, floor, chainage or village" />
            </Form.Item>
            <Form.Item name="documentId" label="Drawing or document">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Optional"
                options={(docs?.items ?? []).map((d) => ({ value: d.id, label: `${d.docNo} ${d.title}${d.current ? ` (${d.current.revision})` : ''}` }))}
              />
            </Form.Item>
          </FormGrid>
          <Form.Item name="boqItemId" label="BOQ item">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Optional" options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}` }))} />
          </Form.Item>
          <Form.Item name="files" label="Photos or marked-up drawing">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
        <FormSection title="Answer needed">
          <Form.Item name="toParty" label="To" extra={!editing ? `Left empty: the project's consultant${project?.clientName ? `, or ${project.clientName}` : ' or client'}.` : undefined}>
            <Input maxLength={200} placeholder="Client's engineer or consultant" />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="priority" label="Priority">
              <Segmented<RfiPriority> options={RFI_PRIORITIES.map((p) => ({ value: p, label: RFI_PRIORITY_LABELS[p] }))} onChange={() => setTimeout(followReplyBy)} />
            </Form.Item>
            <Form.Item name="raisedOn" label="Raised on" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} disabled={editing} disabledDate={(d) => d.isAfter(dayjs(), 'day')} onChange={() => setTimeout(followReplyBy)} />
            </Form.Item>
            <Form.Item
              name="replyBy"
              label="Answer needed by"
              dependencies={['raisedOn']}
              rules={[
                { required: true, message: 'Pick the date' },
                ({ getFieldValue }) => ({
                  validator: (_, v: dayjs.Dayjs | undefined) => (v && getFieldValue('raisedOn') && v.isBefore(getFieldValue('raisedOn'), 'day') ? Promise.reject(new Error('Choose a date on or after the raised date')) : Promise.resolve()),
                }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} onChange={() => (replyTouched.current = true)} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="impacts" label="The answer may change">
            <Checkbox.Group>
              <Space wrap>
                <Checkbox value="cost">Cost</Checkbox>
                <Checkbox value="time">Time</Checkbox>
              </Space>
            </Checkbox.Group>
          </Form.Item>
          {!editing ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              The client&apos;s engineers and consultants on the project are told and can answer in their portal.
            </Typography.Paragraph>
          ) : null}
        </FormSection>
      </Form>
    </FormShell>
  );
}
