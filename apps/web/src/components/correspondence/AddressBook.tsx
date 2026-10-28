'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Flex, Form, Input, Select, Switch, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LetterContactDto } from '@erp/shared';
import { canViewLetters, contactLine } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useClientsPage, useLetterContacts } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { EMAIL_INPUT, PHONE_INPUT } from '@/components/form/inputs';
import { FormGrid, FormShell } from '@/components/form/FormShell';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface ContactForm {
  name: string;
  office?: string;
  organisation?: string;
  address?: string;
  email?: string;
  phone?: string;
  clientId?: string | null;
}

function ContactDialog({ editing, onClose }: { editing: LetterContactDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<ContactForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: clients } = useClientsPage({ pageSize: 200 });
  const entry = editing && editing !== 'new' ? editing : null;
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    if (entry) form.setFieldsValue({ ...entry, office: entry.office ?? undefined, organisation: entry.organisation ?? undefined, address: entry.address ?? undefined, email: entry.email ?? undefined, phone: entry.phone ?? undefined });
  }, [editing, entry, form]);
  const save = useMutation({
    mutationFn: async (v: ContactForm) => {
      const t = (x?: string) => x?.trim() || null;
      const body = { name: v.name.trim(), office: t(v.office), organisation: t(v.organisation), address: t(v.address), email: t(v.email), phone: t(v.phone), clientId: v.clientId ?? null };
      return entry ? (await api.patch<LetterContactDto>(`/letter-contacts/${entry.id}`, body)).data : (await api.post<LetterContactDto>('/letter-contacts', body)).data;
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['letter-contacts'] });
      notify.saved(`${contactLine(c)} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="modal" width={620} projectDefault={false} title={entry ? `Edit ${entry.name}` : 'New address'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Addressed to" rules={[{ required: true, whitespace: true, message: 'Enter who letters are addressed to' }]} extra="The post, as a letter starts: The Executive Engineer">
          <Input maxLength={200} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="office" label="Office">
            <Input maxLength={200} placeholder="Road Division No. 2, Cuttack" />
          </Form.Item>
          <Form.Item name="organisation" label="Department or company">
            <Input maxLength={200} placeholder="Works Department" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="address" label="Address">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={500} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Enter an email such as ee.cuttack@example.com' }]}>
            <Input {...EMAIL_INPUT} maxLength={200} />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input {...PHONE_INPUT} maxLength={30} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="clientId" label="Client" extra="When this office is a client's, its letters show on the client too">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={(clients?.items ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The address book (item 136): offices and people letters come from and go to, picked on a letter's From or To. */
export function AddressBook() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const notify = useNotify();
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<LetterContactDto | 'new' | null>(null);
  const { data, isLoading, error, refetch } = useLetterContacts(all);
  const keeper = !!user && canViewLetters(user.roleKey);
  const toggle = useMutation({
    mutationFn: async (c: LetterContactDto) => (await api.patch<LetterContactDto>(`/letter-contacts/${c.id}`, { isActive: !c.isActive })).data,
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['letter-contacts'] });
      notify.success(`${c.name} ${c.isActive ? 'switched on' : 'switched off'}`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/letter-contacts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['letter-contacts'] }),
  });
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !k || [c.name, c.office, c.organisation, c.address, c.email].some((x) => x?.toLowerCase().includes(k)));
  }, [data, q]);

  return (
    <div className="page-container">
      <PageHeader
        title="Address book"
        subtitle="The offices and people letters come from and go to. A letter's From or To picks from here, and the letterhead prints the address."
        extra={
          keeper ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New address
            </Button>
          ) : null
        }
      />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <Input.Search allowClear placeholder="Find an office or person" aria-label="Find an office or person" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Flex gap={token.marginXS} align="center">
            <Switch size="small" checked={all} onChange={setAll} aria-label="Show switched off" />
            <Typography.Text>Show switched off</Typography.Text>
          </Flex>
        </Flex>
        {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
        <Table<LetterContactDto>
          rowKey="id"
          size="middle"
          loading={isLoading}
          dataSource={rows}
          pagination={rows.length > 50 ? { pageSize: 50 } : false}
          scroll={{ x: 820 }}
          columns={[
            {
              title: 'Addressed to',
              key: 'name',
              render: (_, c) => (
                <div>
                  <Typography.Text strong>{c.name}</Typography.Text>
                  <div className="text-muted">{[c.office, c.organisation].filter(Boolean).join(', ')}</div>
                </div>
              ),
            },
            { title: 'Address', dataIndex: 'address', render: (v: string | null) => v ?? <Typography.Text type="secondary">-</Typography.Text> },
            { title: 'Email and phone', key: 'reach', render: (_, c) => [c.email, c.phone].filter(Boolean).join(' · ') || <Typography.Text type="secondary">-</Typography.Text> },
            { title: 'Client', dataIndex: 'clientName', width: 160, render: (v: string | null) => v ?? <Typography.Text type="secondary">-</Typography.Text> },
            { title: 'Letters', dataIndex: 'letters', width: 90, align: 'right', render: (v: number) => <span translate="no">{v || '-'}</span> },
            {
              title: 'Switched on',
              key: 'active',
              width: 110,
              render: (_, c) => <Switch size="small" checked={c.isActive} disabled={!keeper} loading={toggle.isPending && toggle.variables?.id === c.id} onChange={() => toggle.mutate(c)} aria-label={`${c.name} switched on`} />,
            },
            ...(keeper
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, c: LetterContactDto) => (
                      <Flex gap={4}>
                        <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} />
                        {!c.letters ? (
                          <ConfirmDelete what={contactLine(c)} onConfirm={() => remove.mutateAsync(c.id)}>
                            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${c.name}`} />
                          </ConfirmDelete>
                        ) : null}
                      </Flex>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <ContactDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
