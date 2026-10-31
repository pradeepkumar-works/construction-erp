'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Flex, Form, Input, InputNumber, Select, Switch, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TEST_KINDS, TEST_KIND_LABELS, TEST_TYPE_CODE, specRange, testTypeProblem, type TestKind, type TestTypeDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useTestTypes } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { canManageQaPlan } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { DeleteOutlined, EditOutlined, PlusOutlined, UndoOutlined } from '@/components/common/icons';
import { CODE_INPUT } from '@/components/form/inputs';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface TypeForm {
  code: string;
  name: string;
  kind: TestKind;
  material: string;
  method?: string;
  unit: string;
  specMin?: number | null;
  specMax?: number | null;
  readings: { label: string; days: number }[];
  specimens: number;
  active: boolean;
}

/** A test type's form: a standard one's copy (its code stays) or one of the company's own. */
function TypeDialog({ editing, onClose, codes }: { editing: TestTypeDto | 'new' | null; onClose: () => void; codes: string[] }) {
  const [form] = Form.useForm<TypeForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const type = editing && editing !== 'new' ? editing : null;
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(
      type
        ? { ...type, method: type.method ?? '', readings: type.readings.map((r) => ({ ...r })) }
        : { code: '', name: '', kind: 'OTHER', material: '', method: '', unit: '', readings: [{ label: 'Result', days: 0 }], specimens: 1, active: true },
    );
  }, [editing, type, form]);
  const save = useMutation({
    mutationFn: async (v: TypeForm) => {
      const code = (type?.code ?? v.code).trim().toUpperCase();
      const body = { ...v, code, specMin: v.specMin ?? null, specMax: v.specMax ?? null, method: v.method?.trim() || null };
      const problem = testTypeProblem(body);
      if (problem) throw new Error(problem);
      return (await api.put<TestTypeDto>(`/qa/test-types/${encodeURIComponent(code)}`, body)).data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(`${t.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="drawer" projectDefault={false} title={type ? `Edit ${type.name}` : 'New test type'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="The test">
          <FormGrid cols={2}>
            <Form.Item
              name="code"
              label="Code"
              hidden={!!type}
              rules={
                type
                  ? []
                  : [
                      { required: true, message: 'Give the code, such as FLOW' },
                      { pattern: TEST_TYPE_CODE, message: 'Use capitals, digits and underscores, for example FLOW_TABLE' },
                      { validator: (_, v: string) => (v && codes.includes(v.trim().toUpperCase()) ? Promise.reject(new Error('That code is taken; give another')) : Promise.resolve()) },
                    ]
              }
            >
              <Input {...CODE_INPUT} maxLength={30} placeholder="FLOW" />
            </Form.Item>
            <Form.Item name="kind" label="Recorded as" tooltip="The register groups tests and asks for readings by this" rules={[{ required: true, message: 'Choose what it is recorded as' }]}>
              <Select options={TEST_KINDS.map((k) => ({ value: k, label: TEST_KIND_LABELS[k] }))} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the test' }]}>
            <Input maxLength={120} placeholder="Flow table test of concrete" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="material" label="Material" rules={[{ required: true, whitespace: true, message: 'Say what is tested' }]}>
              <Input maxLength={80} placeholder="Concrete" />
            </Form.Item>
            <Form.Item name="method" label="Method">
              <Input maxLength={80} placeholder="IS 1199 Part 6" />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Limits and readings">
          <FormGrid cols={3}>
            <Form.Item name="unit" label="Unit" rules={[{ required: true, whitespace: true, message: 'Give the unit, such as mm' }]}>
              <Input maxLength={30} />
            </Form.Item>
            <Form.Item name="specMin" label="Lowest that passes">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="specMax" label="Highest that passes">
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Form.Item label="Readings" required>
            <LineTable
              name="readings"
              label="Reading"
              min={1}
              addText="Add reading"
              newLine={() => ({ label: '', days: 0 })}
              columns={[
                {
                  key: 'label',
                  title: 'Reading',
                  render: (f, i) => (
                    <Form.Item name={[f.name, 'label']} noStyle rules={[{ required: true, whitespace: true, message: `Name reading ${i + 1}` }]}>
                      <Input maxLength={60} aria-label={`Reading ${i + 1}`} placeholder="28 days" />
                    </Form.Item>
                  ),
                },
                {
                  key: 'days',
                  title: 'Days after sampling',
                  width: 170,
                  render: (f, i) => (
                    <Form.Item name={[f.name, 'days']} noStyle rules={[{ required: true, message: `Give reading ${i + 1}'s days` }]}>
                      <InputNumber min={0} max={365} precision={0} style={{ width: '100%' }} aria-label={`Reading ${i + 1}, days after sampling`} />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="specimens" label="Specimens in a sample" tooltip="IS 456 makes one cube result the mean of three" rules={[{ required: true, message: 'Give the specimens, 1 to 12' }]}>
              <InputNumber min={1} max={12} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="active" label="Switched on" valuePropName="checked">
              <Switch />
            </Form.Item>
          </FormGrid>
        </FormSection>
      </Form>
    </FormShell>
  );
}

/** Test types (item 137): the standard tests with the company's changes, then its own; the test form and plans pick from them. */
export function TestTypesPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const manage = !!user && canManageQaPlan(user.roleKey);
  const { data, isLoading, error, refetch } = useTestTypes(true);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TestTypeDto | 'new' | null>(null);
  const [q, setQ] = useState('');
  const remove = useMutation({
    mutationFn: async (code: string) => (await api.delete(`/qa/test-types/${encodeURIComponent(code)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality', 'qa'] }),
  });
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data ?? []).filter((t) => !k || `${t.code} ${t.name} ${t.material} ${t.method ?? ''}`.toLowerCase().includes(k));
  }, [data, q]);

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  return (
    <div className="page-container">
      <PageHeader
        title="Test types"
        subtitle="The tests your quality plans and test register pick from: method, unit, limits, readings and specimens."
        crumbs={[{ title: 'Masters', href: '/masters' }, { title: 'Test types' }]}
        extra={
          manage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New test type
            </Button>
          ) : undefined
        }
      />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <Input.Search allowClear placeholder="Find a test" aria-label="Find a test" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Typography.Text type="secondary">
            {data.filter((t) => t.active).length} of {data.length} switched on.
          </Typography.Text>
        </Flex>
        <Table<TestTypeDto>
          rowKey="code"
          size="middle"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Test',
              key: 'name',
              render: (_, t) => (
                <Flex vertical gap={2}>
                  <Flex gap={token.marginXS} align="center" wrap>
                    <Typography.Text strong>{t.name}</Typography.Text>
                    {!t.standard ? <AppTag tone="info">Company's own</AppTag> : t.changed ? <AppTag tone="violet">Changed from standard</AppTag> : null}
                    {!t.active ? <AppTag tone="neutral">Off</AppTag> : null}
                  </Flex>
                  <Typography.Text type="secondary" translate="no">
                    {t.code}
                  </Typography.Text>
                </Flex>
              ),
            },
            { title: 'Material', dataIndex: 'material' },
            { title: 'Method', dataIndex: 'method', render: (v: string | null) => (v ? <span translate="no">{v}</span> : '-') },
            {
              title: 'Limits',
              key: 'limits',
              render: (_, t) => <span translate="no">{specRange(t.specMin === null ? null : String(t.specMin), t.specMax === null ? null : String(t.specMax), t.unit) ?? t.unit}</span>,
            },
            { title: 'Readings', key: 'readings', render: (_, t) => t.readings.map((r) => r.label).join(', ') },
            { title: 'Specimens', dataIndex: 'specimens', width: 100, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
            { title: 'In use by', dataIndex: 'inUse', width: 100, align: 'right', render: (v: number) => <span translate="no">{v || '-'}</span> },
            ...(manage
              ? [
                  {
                    title: <span style={srOnly}>Actions</span>,
                    key: 'actions',
                    width: 96,
                    render: (_: unknown, t: TestTypeDto) => (
                      <Flex gap={4}>
                        <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} />
                        {t.changed ? (
                          <ConfirmDelete what={`your changes to ${t.name}`} verb="Remove" description="It goes back to the standard test." notice={`${t.name} is back to standard`} onConfirm={() => remove.mutateAsync(t.code)}>
                            <Button type="text" icon={<UndoOutlined />} aria-label={`Put ${t.name} back to standard`} />
                          </ConfirmDelete>
                        ) : !t.standard && !t.inUse ? (
                          <ConfirmDelete what={t.name} onConfirm={() => remove.mutateAsync(t.code)}>
                            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
                          </ConfirmDelete>
                        ) : null}
                      </Flex>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {!manage ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: token.margin, marginBottom: 0 }}>
            Ask QA/QC or your project manager to add or change test types.
          </Typography.Paragraph>
        ) : null}
      </Card>
      <TypeDialog editing={editing} onClose={() => setEditing(null)} codes={data.map((t) => t.code)} />
    </div>
  );
}
