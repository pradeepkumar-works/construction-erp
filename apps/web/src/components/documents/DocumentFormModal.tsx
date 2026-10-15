'use client';

import React, { useEffect } from 'react';
import { App, Divider, Form, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, DocumentDetailDto, DocumentDiscipline, DocumentKind, RevisionStatus } from '@erp/shared';
import { DOCUMENT_DISCIPLINES, DOCUMENT_DISCIPLINE_LABELS, DOCUMENT_KINDS, DOCUMENT_KIND_LABELS } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useProjects } from '@/lib/queries';
import { RevisionFields } from './RevisionFields';

interface FormValues {
  projectId: string;
  docNo: string;
  title: string;
  kind: DocumentKind;
  discipline: DocumentDiscipline;
  remarks?: string;
  revision?: { revision: string; issuedOn: dayjs.Dayjs; status: RevisionStatus; receivedFrom?: string; remarks?: string; files?: AttachmentDto[] };
}

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

/** Add a drawing or document with its first revision, or (with `doc`) change its number, title and type. */
export function DocumentFormModal({ open, onClose, projectId, doc, onSaved }: { open: boolean; onClose: () => void; projectId?: string; doc?: DocumentDetailDto | null; onSaved?: (d: DocumentDetailDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const editing = !!doc;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (doc) form.setFieldsValue({ projectId: doc.projectId, docNo: doc.docNo, title: doc.title, kind: doc.kind, discipline: doc.discipline, remarks: doc.remarks ?? undefined });
    else form.setFieldsValue({ projectId, kind: 'DRAWING', discipline: 'GENERAL', revision: { revision: 'R0', issuedOn: dayjs(), status: 'FOR_CONSTRUCTION' } as FormValues['revision'] });
  }, [open, projectId, doc, form]);

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
      message.success(editing ? `${d.docNo} updated` : `${d.docNo} added to the register`);
      qc.invalidateQueries({ queryKey: ['documents'] });
      onSaved?.(d);
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal open={open} title={doc ? `Edit ${doc.docNo}` : 'Add drawing or document'} okText={editing ? 'Save' : 'Add'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={680} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Required' }]} hidden={!!(doc || projectId)}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
        </Form.Item>
        <div style={grid('1fr 2fr')}>
          <Form.Item name="docNo" label="Number" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
            <Input maxLength={60} placeholder="STR-GA-101" />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
            <Input maxLength={200} placeholder="First floor slab reinforcement" />
          </Form.Item>
        </div>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="kind" label="Type">
            <Select options={DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }))} />
          </Form.Item>
          <Form.Item name="discipline" label="Discipline">
            <Select options={DOCUMENT_DISCIPLINES.map((k) => ({ value: k, label: DOCUMENT_DISCIPLINE_LABELS[k] }))} />
          </Form.Item>
        </div>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        {!editing ? (
          <>
            <Divider titlePlacement="start" plain>
              First revision
            </Divider>
            <RevisionFields prefix={['revision']} />
          </>
        ) : null}
      </Form>
    </Modal>
  );
}
