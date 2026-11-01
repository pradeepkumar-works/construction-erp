'use client';

import React, { useEffect, useState } from 'react';
import { Button, Card, Empty, Flex, Form, Input, InputNumber, Segmented, Select, Switch, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  QA_FREQUENCY_LABELS,
  QA_PLAN_SOURCE_LABELS,
  QA_WITNESSES,
  QA_WITNESS_LABELS,
  STANDARD_QA_PLANS,
  type QaFrequency,
  type QaPlanDto,
  type QaPlanLineDto,
  type QaPlanSource,
  type QaWitness,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useQaPlan, useTestTypes } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { UnitInput } from '@/components/common/UnitInput';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { LinkButton } from '@/components/common/LinkButton';
import { MasterInput } from '@/components/masters/MasterInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { IS456_SAMPLING, WitnessTag, lineCovers, lineFrequency } from './qaUi';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface LineForm {
  testType: string;
  source: QaPlanSource;
  match?: string;
  grade?: string;
  itemCategory?: string;
  frequency: QaFrequency;
  per?: number | null;
  unit?: string;
  witness: QaWitness;
  holdPoint: boolean;
  notes?: string;
}

const FREQ_FOR: Record<QaPlanSource, QaFrequency[]> = { WORK: ['IS456', 'QUANTITY', 'DAY'], RECEIPT: ['RECEIPT'] };

/** A plan line's form. */
function LineDialog({ projectId, editing, onClose }: { projectId: string; editing: QaPlanLineDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<LineForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: types } = useTestTypes();
  const line = editing && editing !== 'new' ? editing : null;
  const source = Form.useWatch('source', form) ?? 'WORK';
  const frequency = Form.useWatch('frequency', form);
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(
      line
        ? { ...line, grade: line.grade ?? '', itemCategory: line.itemCategory ?? '', unit: line.unit ?? '', notes: line.notes ?? '' }
        : { source: 'WORK', frequency: 'QUANTITY', witness: 'OWN', holdPoint: false, match: '' },
    );
  }, [editing, line, form]);
  const save = useMutation({
    mutationFn: async (v: LineForm) => {
      const body = {
        testType: v.testType,
        source: v.source,
        match: v.match?.trim() ?? '',
        grade: v.source === 'WORK' ? v.grade?.trim() || null : null,
        itemCategory: v.source === 'RECEIPT' ? v.itemCategory?.trim() || null : null,
        frequency: v.frequency,
        per: v.per ?? null,
        unit: v.frequency === 'QUANTITY' ? v.unit?.trim() || null : null,
        witness: v.witness,
        holdPoint: v.holdPoint,
        notes: v.notes?.trim() || null,
      };
      return line ? (await api.patch<QaPlanLineDto>(`/qa/plan-lines/${line.id}`, body)).data : (await api.post<QaPlanLineDto>('/qa/plan-lines', { projectId, ...body })).data;
    },
    onSuccess: (l) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(`${l.testName} ${line ? 'saved' : 'added to the plan'}`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="drawer" projectDefault={false} title={line ? `Edit ${line.testName}` : 'New plan line'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <FormSection title="The test">
          <Form.Item name="testType" label="Test" rules={[{ required: true, message: 'Choose the test' }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={(types ?? []).map((t) => ({ value: t.code, label: t.method ? `${t.name} (${t.method})` : t.name }))} />
          </Form.Item>
          <Form.Item name="source" label="Counted against">
            <Segmented
              options={(['WORK', 'RECEIPT'] as const).map((s) => ({ value: s, label: QA_PLAN_SOURCE_LABELS[s] }))}
              onChange={(s) => form.setFieldValue('frequency', FREQ_FOR[s as QaPlanSource][s === 'WORK' ? 1 : 0])}
            />
          </Form.Item>
          <Form.Item
            name="match"
            label={source === 'WORK' ? 'Work named with' : 'Items named with'}
            extra="Any of these words, comma separated, in the activity or BOQ item (or the item received)."
            rules={source === 'WORK' ? [{ required: true, whitespace: true, message: 'Give the words the work is named with, such as concrete, rcc' }] : []}
          >
            <Input maxLength={200} placeholder={source === 'WORK' ? 'concrete, rcc, pcc' : 'cement'} />
          </Form.Item>
          {source === 'WORK' ? (
            <Form.Item name="grade" label="Grade (concrete only)" extra="Leave blank to cover every grade.">
              <Input maxLength={10} placeholder="M25" style={{ maxWidth: 160 }} />
            </Form.Item>
          ) : (
            <Form.Item name="itemCategory" label="Item category">
              <MasterInput list="itemCategory" />
            </Form.Item>
          )}
        </FormSection>
        <FormSection title="How often">
          <FormGrid cols={3}>
            <Form.Item name="frequency" label="Frequency" rules={[{ required: true, message: 'Choose how often' }]}>
              <Select options={FREQ_FOR[source].map((f) => ({ value: f, label: QA_FREQUENCY_LABELS[f] }))} />
            </Form.Item>
            {frequency === 'QUANTITY' || frequency === 'RECEIPT' ? (
              <Form.Item
                name="per"
                label={frequency === 'QUANTITY' ? 'One test per' : 'One test per (of a lot)'}
                rules={frequency === 'QUANTITY' ? [{ required: true, message: 'Give how much work one test covers' }] : []}
                extra={frequency === 'RECEIPT' ? 'Blank: one for each lot.' : undefined}
              >
                <InputNumber min={0.001} style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
            {frequency === 'QUANTITY' ? (
              <Form.Item name="unit" label="Unit" rules={[{ required: true, whitespace: true, message: 'Give the unit the work is counted in' }]}>
                <UnitInput maxLength={20} />
              </Form.Item>
            ) : null}
          </FormGrid>
          {frequency === 'IS456' ? (
            <Typography.Paragraph type="secondary">
              {`Per grade and day: ${IS456_SAMPLING}.`}
            </Typography.Paragraph>
          ) : null}
          <FormGrid cols={2}>
            <Form.Item name="witness" label="Witnessed by">
              <Select options={QA_WITNESSES.map((w) => ({ value: w, label: QA_WITNESS_LABELS[w] }))} />
            </Form.Item>
            <Form.Item name="holdPoint" label="Hold point" valuePropName="checked" tooltip="Work waits for this test to pass">
              <Switch />
            </Form.Item>
          </FormGrid>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} maxLength={500} placeholder="Clause of the contract's specification, the acceptance criteria" />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}

function PlanTable({ plan, onEdit }: { plan: QaPlanDto; onEdit: (l: QaPlanLineDto) => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/qa/plan-lines/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality', 'qa'] }),
  });
  return (
    <Table<QaPlanLineDto>
      rowKey="id"
      size="middle"
      dataSource={plan.lines}
      pagination={false}
      scroll={{ x: 900 }}
      columns={[
        { title: 'Test', key: 'test', render: (_, l) => <Typography.Text strong>{l.testName}</Typography.Text> },
        { title: 'Covers', key: 'covers', render: (_, l) => lineCovers(l) },
        { title: 'How often', key: 'freq', render: (_, l) => <span translate="no">{lineFrequency(l)}</span> },
        { title: 'Witness', key: 'witness', render: (_, l) => <WitnessTag line={l} /> },
        { title: 'Notes', dataIndex: 'notes', render: (v: string | null) => v ?? '-' },
        ...(plan.canEdit
          ? [
              {
                title: <span style={srOnly}>Actions</span>,
                key: 'actions',
                width: 96,
                render: (_: unknown, l: QaPlanLineDto) => (
                  <Flex gap={4}>
                    <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${l.testName}`} onClick={() => onEdit(l)} />
                    <ConfirmDelete what={l.testName} verb="Remove" description="It comes off the plan. Tests taken under it stay in the register." onConfirm={() => remove.mutateAsync(l.id)}>
                      <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${l.testName}`} />
                    </ConfirmDelete>
                  </Flex>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/** The quality plan: a project's tests, what each is counted against, how often and who witnesses. */
export function QualityPlanPage() {
  const { token } = theme.useToken();
  const [projectId, setProjectId] = useProjectScope();
  const { data: plan, isLoading, error, refetch } = useQaPlan(projectId);
  const [editing, setEditing] = useState<QaPlanLineDto | 'new' | null>(null);
  const qc = useQueryClient();
  const notify = useNotify();
  const start = useMutation({
    mutationFn: async () => (await api.post<QaPlanDto>(`/qa/plan/${projectId}/standard`)).data,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['quality', 'qa'] });
      notify.saved(`${p.lines.length} tests in the plan`);
    },
    meta: FAIL_NOTICE,
  });
  const standard = plan ? STANDARD_QA_PLANS[plan.projectType]?.length ?? 0 : 0;

  return (
    <div className="page-container">
      <PageHeader
        title="Quality plan"
        subtitle="Each project's inspection and test plan: which tests, against what work or material, how often and who witnesses. Tests due are counted from it."
        extra={
          <>
            <LinkButton href="/tests-due">Tests due</LinkButton>
            {plan?.canEdit ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
                New plan line
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} placeholder="Choose a project" allowClear={false} style={{ minWidth: 260, maxWidth: '100%' }} />
        </Flex>
        {!projectId ? (
          <Empty description="Choose a project to see its quality plan." />
        ) : isLoading ? (
          <PageSkeleton shape="list" />
        ) : error || !plan ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : plan.lines.length ? (
          <PlanTable plan={plan} onEdit={setEditing} />
        ) : (
          <Empty description={`${plan.projectName} has no quality plan yet.`}>
            {plan.canEdit && standard ? (
              <Button type="primary" loading={start.isPending} onClick={() => start.mutate()}>
                Start from the standard plan ({standard} tests)
              </Button>
            ) : null}
          </Empty>
        )}
      </Card>
      {projectId ? <LineDialog projectId={projectId} editing={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
