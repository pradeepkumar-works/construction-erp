'use client';

import { ProjectSelect } from '@/components/common/ProjectSelect';
import React, { useEffect, useState } from 'react';
import { Flex, Form, Input, Select, Space } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, DocumentDetailDto, DocumentDiscipline, DocumentKind, RevisionStatus } from '@erp/shared';
import { DOCUMENT_DISCIPLINES, DOCUMENT_DISCIPLINE_LABELS, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, disciplineOf, readText } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { ReadDocumentButton, ReadPreview, readDateReason, readFieldProps, useKeepReadFile, type ReadState } from '@/components/ai/ReadDocument';
import { RevisionFields } from './RevisionFields';
import { NextDrawingNo } from '@/components/design/NextDrawingNo';

interface FormValues {
  projectId: string;
  docNo: string;
  title: string;
  kind: DocumentKind;
  discipline: DocumentDiscipline;
  remarks?: string;
  revision?: { revision: string; issuedOn: dayjs.Dayjs; status: RevisionStatus; receivedFrom?: string; remarks?: string; files?: AttachmentDto[] };
}

/** Add a drawing or document with its first revision, or (with `doc`) change its number, title and type. */
export function DocumentFormModal({ open, onClose, projectId, doc, onSaved }: { open: boolean; onClose: () => void; projectId?: string; doc?: DocumentDetailDto | null; onSaved?: (d: DocumentDetailDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const notify = useNotify();
  const qc = useQueryClient();
  const editing = !!doc;
  // A drawing's title block read to fill the form.
  const [readState, setReadState] = useState<ReadState | null>(null);
  // The drawing itself is kept as the revision's file.
  const keepDrawing = useKeepReadFile(form, ['revision', 'files']);
  const [activeRead, setActiveRead] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setReadState(null);
    if (doc) form.setFieldsValue({ projectId: doc.projectId, docNo: doc.docNo, title: doc.title, kind: doc.kind, discipline: doc.discipline, remarks: doc.remarks ?? undefined });
    else form.setFieldsValue({ projectId, kind: 'DRAWING', discipline: 'GENERAL', revision: { revision: 'R0', issuedOn: dayjs(), status: 'FOR_CONSTRUCTION' } as FormValues['revision'] });
  }, [open, projectId, doc, form]);

  /** Number, title, discipline and the first revision from the title block; the drawing itself goes on the revision. */
  const applyRead = (s: ReadState) => {
    setReadState(s);
    const f = s.result.fields;
    const date = readText(f.date);
    const discipline = disciplineOf(readText(f.discipline));
    form.setFieldsValue({
      docNo: readText(f.drawingNo) ?? form.getFieldValue('docNo'),
      title: readText(f.title) ?? form.getFieldValue('title'),
      kind: 'DRAWING',
      ...(discipline ? { discipline } : {}),
      revision: {
        ...form.getFieldValue('revision'),
        ...(readText(f.revision) ? { revision: readText(f.revision)! } : {}),
        ...(date && !readDateReason(date) ? { issuedOn: dayjs(date) } : {}),
        ...(readText(f.issuedBy) ? { receivedFrom: readText(f.issuedBy)! } : {}),
      },
    });
    keepDrawing.keep(s);
  };
  const read = (key: string) => readFieldProps(readState, key, setActiveRead);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = { docNo: v.docNo.trim(), title: v.title.trim(), kind: v.kind, discipline: v.discipline, remarks: v.remarks?.trim() || (editing ? null : undefined) };
      if (doc) return (await api.patch<DocumentDetailDto>(`/documents/${doc.id}`, body)).data;
      const r = v.revision!;
      return (
        await api.post<DocumentDetailDto>('/documents', {
          projectId: v.projectId,
          ...body,
          revision: {
            revision: r.revision.trim(),
            issuedOn: r.issuedOn.format('YYYY-MM-DD'),
            status: r.status,
            receivedFrom: r.receivedFrom?.trim() || undefined,
            remarks: r.remarks?.trim() || undefined,
            attachmentIds: (r.files ?? []).map((f) => f.id),
          },
        })
      ).data;
    },
    onSuccess: (d) => {
      notify.saved(editing ? `${d.docNo} updated` : `${d.docNo} added to the register`);
      qc.invalidateQueries({ queryKey: ['documents'] });
      onSaved?.(d);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={680} title={doc ? `Edit ${doc.docNo}` : 'New drawing or document'} okText="Save" onSubmit={(v) => mutation.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {!editing && !readState ? (
          <Flex justify="flex-end" style={{ marginBottom: 8 }}>
            <ReadDocumentButton kind="drawing" label="Fill from title block" onRead={applyRead} />
          </Flex>
        ) : null}
        {readState ? <ReadPreview state={readState} active={activeRead} kept={keepDrawing.kept} onClear={() => setReadState(null)} /> : null}
        <FormSection title="Document">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!(doc || projectId)}>
            <ProjectSelect allowClear={false} placeholder="Choose a project" style={{ width: '100%' }} />
          </Form.Item>
          <FormGrid cols={2}>
            {editing ? (
              <Form.Item name="docNo" label="Number" rules={[{ required: true, whitespace: true, message: 'Enter the number, e.g. STR-GA-101' }]} {...read('drawingNo')}>
                <Input maxLength={60} placeholder="STR-GA-101" />
              </Form.Item>
            ) : (
              <Form.Item label="Number" required {...read('drawingNo')}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="docNo" noStyle rules={[{ required: true, whitespace: true, message: 'Enter the number, or take the next one' }]}>
                    <Input maxLength={60} placeholder="STR-GA-101" aria-label="Number" />
                  </Form.Item>
                  <NextDrawingNo form={form} projectId={projectId} />
                </Space.Compact>
              </Form.Item>
            )}
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Enter the title' }]} {...read('title')}>
              <Input maxLength={200} placeholder="First floor slab reinforcement" />
            </Form.Item>
          </FormGrid>
          <FormGrid cols={2}>
            <Form.Item name="kind" label="Type">
              <Select options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="discipline" label="Discipline" {...read('discipline')}>
              <Select options={DOCUMENT_DISCIPLINES.map((k) => ({ value: k, label: DOCUMENT_DISCIPLINE_LABELS[k] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </FormSection>
        {!editing ? (
          <FormSection title="First revision">
            <RevisionFields prefix={['revision']} read={read} />
          </FormSection>
        ) : null}
      </Form>
    </FormShell>
  );
}
