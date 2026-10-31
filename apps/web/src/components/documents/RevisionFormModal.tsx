'use client';

import React, { useEffect } from 'react';
import { App, Form } from 'antd';
import dayjs from 'dayjs';
import type { AttachmentDto, DocumentDetailDto, DocumentRevisionDto, RevisionStatus } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { FormShell } from '@/components/form/FormShell';
import { RevisionFields } from './RevisionFields';

interface FormValues {
  revision: string;
  issuedOn: dayjs.Dayjs;
  status: RevisionStatus;
  receivedFrom?: string;
  remarks?: string;
  files?: AttachmentDto[];
}

/** Next revision label: R1 after R0, B after A, P3 after P2; else empty. */
function nextRevision(r: string | undefined) {
  if (!r) return 'R0';
  const m = r.match(/^(.*?)(\d+)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  if (/^[A-Y]$/i.test(r)) return String.fromCharCode(r.charCodeAt(0) + 1);
  return '';
}

/** Add a revision to a document, or (with `revision`) correct one or record the consultant's decision on it. */
export function RevisionFormModal({ open, onClose, doc, revision }: { open: boolean; onClose: () => void; doc: DocumentDetailDto | null | undefined; revision?: DocumentRevisionDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editing = !!revision;

  useEffect(() => {
    if (!open || !doc) return;
    form.resetFields();
    if (revision)
      form.setFieldsValue({
        revision: revision.revision,
        issuedOn: dayjs(revision.issuedOn),
        status: revision.status,
        receivedFrom: revision.receivedFrom ?? undefined,
        remarks: revision.remarks ?? undefined,
        files: revision.attachments,
      });
    else form.setFieldsValue({ revision: nextRevision(doc.current?.revision), issuedOn: dayjs(), status: doc.current?.status ?? 'FOR_CONSTRUCTION', receivedFrom: doc.current?.receivedFrom ?? undefined });
  }, [open, doc, revision, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        revision: v.revision.trim(),
        issuedOn: v.issuedOn.format('YYYY-MM-DD'),
        status: v.status,
        receivedFrom: v.receivedFrom?.trim() || (editing ? null : undefined),
        remarks: v.remarks?.trim() || (editing ? null : undefined),
        attachmentIds: (v.files ?? []).map((f) => f.id),
      };
      return revision ? (await api.patch<DocumentDetailDto>(`/documents/${doc!.id}/revisions/${revision.id}`, body)).data : (await api.post<DocumentDetailDto>(`/documents/${doc!.id}/revisions`, body)).data;
    },
    onSuccess: (d) => {
      message.success(editing ? 'Revision updated' : `${d.docNo} Rev ${d.current?.revision ?? ''} recorded`);
      qc.invalidateQueries({ queryKey: ['documents'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={doc ? (revision ? `${doc.docNo} Rev ${revision.revision}` : `New revision of ${doc.docNo}`) : ''}
      okText={editing ? 'Save' : 'Record revision'}
      onSubmit={(v) => mutation.mutateAsync(v)}
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <RevisionFields />
      </Form>
    </FormShell>
  );
}
