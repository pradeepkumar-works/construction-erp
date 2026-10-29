'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Button, Card, Flex, Form, Input, Select, Switch, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LAB_KINDS, LAB_KIND_LABELS, NABL_NO, canManageQaPlan, type LabKind, type QaLabDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useQaLabs } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { CODE_INPUT, EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule, upper } from '@/components/form/inputs';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { AccreditationTag } from './qaUi';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface LabForm {
  name: string;
  kind: LabKind;
  nablNo?: string;
  nablValidTill?: dayjs.Dayjs | null;
  projectId?: string;
  address?: string;
  contact?: string;
  phone?: string;
  email?: string;
  active: boolean;
  notes?: string;
}

function LabDialog({ editing, onClose }: { editing: QaLabDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<LabForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const lab = editing && editing !== 'new' ? editing : null;
  const kind = Form.useWatch('kind', form);
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(
      lab
        ? {
            name: lab.name,
            kind: lab.kind,
            nablNo: lab.nablNo ?? '',
            nablValidTill: lab.nablValidTill ? dayjs(lab.nablValidTill) : null,
            projectId: lab.projectId ?? undefined,
            address: lab.address ?? '',
            contact: lab.contact ?? '',
            phone: lab.phone ?? '',
            email: lab.email ?? '',
            active: lab.active,
            notes: lab.notes ?? '',
          }
        : { kind: 'NABL', active: true },
    );
  }, [editing, lab, form]);
  const save = useMutation({
    mutationFn: async (v: LabForm) => {
      const body = {
        name: v.name,
        kind: v.kind,
        nablNo: v.kind === 'NABL' ? v.nablNo || null : null,
        nablValidTill: v.kind === 'NABL' && v.nablValidTill ? v.nablValidTill.format('YYYY-MM-DD') : null,
        projectId: v.kind === 'SITE' ? v.projectId || null : null,
        address: v.address || null,
        contact: v.contact || null,
        phone: v.phone || null,
        email: v.email || null,
        active: v.active,
        notes: v.notes || null,
      };
      return lab ? (await api.put<QaLabDto>(`/qa/labs/${lab.id}`, body)).data : (await api.post<QaLabDto>('/qa/labs', body)).data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(`${l.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="modal" width={640} projectDefault={false} title={lab ? `Edit ${lab.name}` : 'New lab'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the lab' }]}>
          <Input maxLength={120} placeholder="Kalinga Testing Labs, Bhubaneswar" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="kind" label="Kind" rules={[{ required: true, message: 'Choose the kind of lab' }]}>
            <Select options={LAB_KINDS.map((k) => ({ value: k, label: LAB_KIND_LABELS[k] }))} />
          </Form.Item>
          {kind === 'SITE' ? (
            <Form.Item name="projectId" label="At the project" rules={[{ required: true, message: 'Choose the project the lab is at' }]}>
              <ProjectSelect allowClear={false} placeholder="Choose the project" style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
        </FormGrid>
        {kind === 'NABL' ? (
          <FormGrid cols={2}>
            <Form.Item name="nablNo" label="NABL certificate" normalize={upper} rules={[{ required: true, whitespace: true, message: 'Give the certificate number, such as TC-5678' }, { pattern: NABL_NO, message: 'It looks like TC-5678' }]}>
              <Input {...CODE_INPUT} maxLength={20} placeholder="TC-5678" />
            </Form.Item>
            <Form.Item name="nablValidTill" label="Valid till" rules={[{ required: true, message: 'Pick the day the accreditation runs to' }]}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </FormGrid>
        ) : null}
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="contact" label="Contact">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
            <Input {...PHONE_INPUT} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[emailRule]}>
            <Input {...EMAIL_INPUT} maxLength={120} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="notes" label="Notes">
            <Input maxLength={1000} placeholder="Tests it is accredited for, rates" />
          </Form.Item>
          <Form.Item name="active" label="In use" valuePropName="checked">
            <Switch />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** Labs (item 137 part 2): where samples are tested, an NABL lab with its accreditation, and the samples each holds. */
export function LabsPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const manage = !!user && canManageQaPlan(user.roleKey);
  const { data, isLoading, error, refetch } = useQaLabs();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<QaLabDto | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete<{ switchedOff: boolean }>(`/qa/labs/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality', 'qa'] }),
  });
  const newButton = manage ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
      New lab
    </Button>
  ) : undefined;

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  return (
    <div className="page-container">
      <PageHeader
        title="Labs"
        subtitle="Where samples are tested: the site's own lab, NABL labs with their accreditation, and the group company lab."
        crumbs={[{ title: 'Masters', href: '/masters' }, { title: 'Labs' }]}
        extra={newButton}
      />
      <Card>
        <Table<QaLabDto>
          rowKey="id"
          size="middle"
          dataSource={data}
          pagination={false}
          scroll={{ x: 860 }}
          locale={{ emptyText: <Flex vertical align="center" gap={token.marginSM}><Typography.Text type="secondary">No lab yet. Add the labs your samples go to.</Typography.Text>{newButton}</Flex> }}
          columns={[
            {
              title: 'Lab',
              key: 'name',
              render: (_, l) => (
                <Flex vertical gap={2}>
                  <Flex gap={token.marginXS} align="center" wrap>
                    <Typography.Text strong translate="no">
                      {l.name}
                    </Typography.Text>
                    {!l.active ? <AppTag tone="neutral">Off</AppTag> : null}
                  </Flex>
                  <Typography.Text type="secondary">{l.kind === 'SITE' && l.projectName ? `Site lab, ${l.projectName}` : LAB_KIND_LABELS[l.kind]}</Typography.Text>
                </Flex>
              ),
            },
            {
              title: 'Accreditation',
              key: 'nabl',
              render: (_, l) =>
                l.kind === 'NABL' ? (
                  <Flex vertical gap={2} align="start">
                    <span translate="no">{l.nablNo}</span>
                    <Flex gap={token.marginXS} align="center" wrap>
                      <Typography.Text type="secondary">till {formatDate(l.nablValidTill)}</Typography.Text>
                      <AccreditationTag state={l.accreditation} />
                    </Flex>
                  </Flex>
                ) : (
                  '-'
                ),
            },
            { title: 'Contact', key: 'contact', render: (_, l) => [l.contact, l.phone].filter(Boolean).join(', ') || '-' },
            {
              title: 'At the lab',
              dataIndex: 'atLab',
              width: 110,
              align: 'right',
              render: (v: number, l) => (v ? <Link href={`/lab-samples?labId=${l.id}`}>{v}</Link> : <span translate="no">-</span>),
            },
            { title: 'Reported', dataIndex: 'reported', width: 100, align: 'right', render: (v: number) => <span translate="no">{v || '-'}</span> },
            ...(manage
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, l: QaLabDto) => (
                      <Flex gap={4}>
                        <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)} />
                        <ConfirmDelete
                          what={l.name}
                          description={l.atLab + l.reported ? 'Samples went to it, so it is switched off and kept on them.' : undefined}
                          verb={l.atLab + l.reported ? 'Remove' : 'Delete'}
                          notice={l.atLab + l.reported ? `${l.name} switched off` : undefined}
                          onConfirm={() => remove.mutateAsync(l.id)}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${l.name}`} />
                        </ConfirmDelete>
                      </Flex>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {!manage ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: token.margin, marginBottom: 0 }}>
            Ask QA/QC or your project manager to add or change labs.
          </Typography.Paragraph>
        ) : null}
      </Card>
      <LabDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
