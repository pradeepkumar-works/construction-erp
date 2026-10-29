'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Flex, Form, Input, Select, Switch, Table, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LetterTemplateDto } from '@erp/shared';
import { LETTER_TEMPLATE_FIELDS, canViewLetters } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useLetterTemplates, useMasterList } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { FormShell } from '@/components/form/FormShell';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface TemplateForm {
  name: string;
  category?: string | null;
  subject: string;
  body: string;
}

function TemplateDialog({ editing, onClose }: { editing: LetterTemplateDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<TemplateForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: categories } = useMasterList('letter-category');
  const entry = editing && editing !== 'new' ? editing : null;
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    if (entry) form.setFieldsValue({ name: entry.name, category: entry.category, subject: entry.subject, body: entry.body });
  }, [editing, entry, form]);
  const save = useMutation({
    mutationFn: async (v: TemplateForm) => {
      const body = { name: v.name.trim(), category: v.category ?? null, subject: v.subject.trim(), body: v.body };
      return entry ? (await api.patch<LetterTemplateDto>(`/letter-templates/${entry.id}`, body)).data : (await api.post<LetterTemplateDto>('/letter-templates', body)).data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['letter-templates'] });
      notify.saved(`${t.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="drawer" width={720} projectDefault={false} title={entry ? `Edit ${entry.name}` : 'New template'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the template' }]}>
          <Input maxLength={120} placeholder="Request for drawings" />
        </Form.Item>
        <Form.Item name="category" label="Category">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={(categories?.entries ?? []).filter((e) => e.isActive).map((e) => ({ value: e.code, label: e.name }))} />
        </Form.Item>
        <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Enter the subject' }]}>
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="body" label="Letter text" rules={[{ required: true, whitespace: true, message: 'Write the letter' }]} extra={`Filled in when a letter starts from it: ${LETTER_TEMPLATE_FIELDS.join(', ')}. A part with no value stays for the writer to fill.`}>
          <Input.TextArea autoSize={{ minRows: 8, maxRows: 24 }} maxLength={20000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Letter templates (item 136): the standard letters a draft starts from, with their placeholders. */
export function LetterTemplates() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const notify = useNotify();
  const [editing, setEditing] = useState<LetterTemplateDto | 'new' | null>(null);
  const { data, isLoading, error, refetch } = useLetterTemplates();
  const { data: categories } = useMasterList('letter-category');
  const keeper = !!user && canViewLetters(user.roleKey);
  const toggle = useMutation({
    mutationFn: async (t: LetterTemplateDto) => (await api.patch<LetterTemplateDto>(`/letter-templates/${t.id}`, { isActive: !t.isActive })).data,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['letter-templates'] });
      notify.success(`${t.name} ${t.isActive ? 'switched on' : 'switched off'}`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/letter-templates/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['letter-templates'] }),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Letter templates"
        subtitle="Standard letters a new outward letter starts from. The address, project, their reference and date are filled in for the writer."
        extra={
          keeper ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New template
            </Button>
          ) : null
        }
      />
      <Card>
        {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
        <Table<LetterTemplateDto>
          rowKey="id"
          size="middle"
          loading={isLoading}
          dataSource={data ?? []}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            {
              title: 'Template',
              key: 'name',
              render: (_, t) => (
                <div>
                  <Typography.Text strong>{t.name}</Typography.Text>
                  <div className="text-muted">{t.subject}</div>
                </div>
              ),
            },
            { title: 'Category', dataIndex: 'category', width: 200, render: (v: string | null) => (v ? (categories?.entries.find((e) => e.code === v)?.name ?? v) : <Typography.Text type="secondary">-</Typography.Text>) },
            {
              title: 'Switched on',
              key: 'active',
              width: 110,
              render: (_, t) => <Switch size="small" checked={t.isActive} disabled={!keeper} loading={toggle.isPending && toggle.variables?.id === t.id} onChange={() => toggle.mutate(t)} aria-label={`${t.name} switched on`} />,
            },
            ...(keeper
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, t: LetterTemplateDto) => (
                      <Flex gap={4}>
                        <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} />
                        <ConfirmDelete what={t.name} onConfirm={() => remove.mutateAsync(t.id)}>
                          <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
                        </ConfirmDelete>
                      </Flex>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <TemplateDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
