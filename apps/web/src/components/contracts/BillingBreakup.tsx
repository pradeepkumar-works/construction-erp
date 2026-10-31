'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Descriptions, Empty, Flex, Form, Input, InputNumber, Popconfirm, Progress, Segmented, Select, Space, Table, Tooltip, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { EditOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractCurrency, BillingBreakupDto, BillingComponentDto, BillingStageDto, MilestoneRowDto, PackageStage, StageTrigger } from '@erp/shared';
import { BILLING_BASIS_LABELS, PACKAGE_STAGES, PACKAGE_STAGE_LABELS, STAGE_TRIGGERS, billsByStages, STAGE_TRIGGER_HINTS, STAGE_TRIGGER_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useActivities, useBillingBreakup, useEpc, useStockItems } from '@/lib/queries';
import { formatMoney, formatMonthShort, formatPct, inContract, moneyPrefix, outOfContract, toNumber } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

const moneyOf = (c: ContractCurrency | undefined) => (v: string | null) => (v ? <span className="mono" translate="no">{formatMoney(v, c)}</span> : '-');
const TRIGGER_COLORS: Record<StageTrigger, string> = { EVENT: 'purple', PROGRESS: 'blue', SUPPLY: 'cyan', TEST: 'geekblue' };
const VISUALLY_HIDDEN: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };
const numOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

/** A % bar with its figure, for billed and evidence columns. */
function Pct({ value, label }: { value: number; label: string }) {
  return (
    <Flex align="center" gap={8} style={{ minWidth: 120 }}>
      <Progress percent={Math.min(100, value)} showInfo={false} size="small" style={{ flex: 1, margin: 0 }} aria-label={label} />
      <span className="mono" translate="no" style={{ minWidth: 44, textAlign: 'right' }}>
        {formatPct(value)}
      </span>
    </Flex>
  );
}

/**
 * The billing break-up of a lump-sum contract (item 129, ARCHITECTURE "Stage billing") on its Contract tab: the
 * components' shares of the lump sum and their payment stages with what each has earned today, the milestone grid with
 * what was billed against it, and the slippage tiers. Bills take their stage lines from it.
 */
export function BillingBreakup({ projectId }: { projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useBillingBreakup(projectId);
  const money = moneyOf(data);
  const [component, setComponent] = useState<BillingComponentDto | 'new' | null>(null);
  const [stage, setStage] = useState<{ component: BillingComponentDto; stage: BillingStageDto | null } | null>(null);
  const [terms, setTerms] = useState(false);
  const [grid, setGrid] = useState(false);
  const [tiers, setTiers] = useState(false);
  const key = ['contract', projectId, 'billing-breakup'];
  const saved = (d: BillingBreakupDto) => {
    qc.setQueryData(key, d);
    qc.invalidateQueries({ queryKey: ['bills'] });
  };
  const standard = useMutation({
    mutationFn: async (replace: boolean) => (await api.post<BillingBreakupDto>(`/projects/${projectId}/billing-breakup/standard`, { replace })).data,
    onSuccess: (d) => {
      saved(d);
      message.success(`Payment schedule made: ${d.components.length} components from the project's structure`);
    },
    meta: FAIL_NOTICE,
  });
  const removeComponent = useMutation({
    mutationFn: async (id: string) => (await api.delete<BillingBreakupDto>(`/projects/${projectId}/billing-breakup/components/${id}`)).data,
    onSuccess: saved,
  });
  const removeStage = useMutation({
    mutationFn: async (id: string) => (await api.delete<BillingBreakupDto>(`/projects/${projectId}/billing-breakup/stages/${id}`)).data,
    onSuccess: saved,
  });

  if (isLoading) return <Section title="Payment schedule" loading />;
  if (error || !data) return <QueryError error={error ?? new Error('Payment schedule not found')} onRetry={() => refetch()} />;
  if (!billsByStages(data.contractModel)) return null;

  const hasParts = (c: BillingComponentDto) => data.components.some((k) => k.parentId === c.id);
  const stageColumns = (c: BillingComponentDto) => [
    { title: 'Stage', dataIndex: 'name', key: 'name' },
    { title: 'Of the component', dataIndex: 'pct', key: 'pct', align: 'right' as const, render: (v: string) => <span className="mono">{formatPct(v, { digits: 2 })}</span> },
    {
      title: 'Paid',
      dataIndex: 'trigger',
      key: 'trigger',
      render: (t: StageTrigger) => (
        <Tooltip title={STAGE_TRIGGER_HINTS[t]}>
          <AppTag color={TRIGGER_COLORS[t]}>{STAGE_TRIGGER_LABELS[t]}</AppTag>
        </Tooltip>
      ),
    },
    { title: 'Value', dataIndex: 'value', key: 'value', align: 'right' as const, render: money },
    {
      title: 'Earned today',
      key: 'evidence',
      render: (_: unknown, s: BillingStageDto) => (
        <div style={{ minWidth: 200 }}>
          <Pct value={s.evidencePct} label={`${s.name}: earned today`} />
          <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
            {s.evidenceText}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Billed', dataIndex: 'billedPct', key: 'billed', render: (v: number, s: BillingStageDto) => <Pct value={v} label={`${s.name}: billed`} /> },
    ...(data.canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 150,
            render: (_: unknown, s: BillingStageDto) => (
              <Space size={0}>
                <Button type="link" size="small" onClick={() => setStage({ component: c, stage: s })}>
                  {s.trigger === 'EVENT' && !s.achievedOn ? 'Record date' : 'Edit'}
                </Button>
                <ConfirmDelete what={`stage ${s.name} of ${c.code}`} verb="Remove" notice={false} onConfirm={() => removeStage.mutateAsync(s.id)}>
                  <Button type="link" size="small" danger>
                    Remove
                  </Button>
                </ConfirmDelete>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const standardButton = data.canEdit && !data.hasBills ? (
    data.components.length ? (
      <Popconfirm title="Rebuild the payment schedule from the structure?" description="The components and stages there are now are replaced." okText="Rebuild" onConfirm={() => standard.mutateAsync(true)}>
        <Button loading={standard.isPending}>Rebuild from the structure</Button>
      </Popconfirm>
    ) : (
      <Button type="primary" loading={standard.isPending} onClick={() => standard.mutate(false)}>
        Make the standard break-up
      </Button>
    )
  ) : null;

  return (
    <>
      <Section
        title="Payment schedule"
        extra={
          <Space wrap>
            {standardButton}
            {data.canEdit && data.components.length ? (
              <Button icon={<PlusOutlined />} onClick={() => setComponent('new')}>
                Add component
              </Button>
            ) : null}
            {data.canEditTerms ? (
              <Button icon={<EditOutlined />} onClick={() => setTerms(true)}>
                Edit terms
              </Button>
            ) : null}
          </Space>
        }
      >
        <Descriptions size="small" column={{ xs: 1, sm: 3 }} layout="vertical" bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="Lump sum the components share">
            {money(data.lumpSum)}
            {!data.lumpSumSet && <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>The contract value</div>}
          </Descriptions.Item>
          <Descriptions.Item label="Unit-rate items paid at">
            <span className="mono" translate="no">rate × {data.tenderFactor}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Mobilisation advance recovered">
            {data.advanceRecoveryFromPct && data.advanceRecoveryToPct ? `From ${formatPct(data.advanceRecoveryFromPct)} to ${formatPct(data.advanceRecoveryToPct)} of the contract executed` : 'A % of each bill'}
          </Descriptions.Item>
        </Descriptions>
        {data.problems.length ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title="Bills stay on measured items until the break-up adds up"
            description={
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {data.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            }
          />
        ) : null}
        {data.components.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No break-up yet. Bills on this project are priced from measurements until it has one. The standard break-up takes each component of the structure with its weight as its share, and the usual stages for its kind."
          >
            {standardButton}
          </Empty>
        ) : (
          <Table<BillingComponentDto>
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={data.components}
            expandable={{
              rowExpandable: (c) => c.basis === 'STAGES' && !hasParts(c),
              expandedRowRender: (c) => (
                <Table<BillingStageDto>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  dataSource={c.stages}
                  columns={stageColumns(c)}
                  locale={{ emptyText: 'No stages yet' }}
                  footer={
                    data.canEdit
                      ? () => (
                          <Button size="small" icon={<PlusOutlined />} onClick={() => setStage({ component: c, stage: null })}>
                            Add stage
                          </Button>
                        )
                      : undefined
                  }
                />
              ),
            }}
            columns={[
              {
                title: 'Component',
                key: 'name',
                render: (_, c) => (
                  <div style={{ paddingInlineStart: c.parentId ? 20 : 0 }}>
                    <span className="mono" translate="no">
                      {c.code}
                    </span>{' '}
                    {c.name}
                  </div>
                ),
              },
              { title: 'Paid by', dataIndex: 'basis', key: 'basis', render: (b: BillingComponentDto['basis']) => <AppTag>{BILLING_BASIS_LABELS[b]}</AppTag> },
              {
                title: 'Share',
                key: 'share',
                align: 'right',
                render: (_, c) =>
                  c.sharePct === null ? (
                    '-'
                  ) : (
                    <Tooltip title={c.parentId ? `${formatPct(c.sharePct, { digits: 2 })} of its component, ${formatPct(c.effectiveSharePct, { digits: 2 })} of the lump sum` : undefined}>
                      <span className="mono" translate="no">
                        {formatPct(c.sharePct, { digits: 2 })}
                      </span>
                    </Tooltip>
                  ),
              },
              { title: 'Value', dataIndex: 'value', key: 'value', align: 'right', render: money },
              { title: 'Stages', key: 'stages', align: 'right', render: (_, c) => (hasParts(c) ? 'In its parts' : c.basis === 'STAGES' ? c.stages.length : 'Measured') },
              { title: 'Billed', dataIndex: 'billedPct', key: 'billed', render: (v: number, c) => (c.basis === 'STAGES' ? <Pct value={v} label={`${c.code} ${c.name}: billed`} /> : '-') },
              ...(data.canEdit
                ? [
                    {
                      title: '',
                      key: 'actions',
                      width: 150,
                      render: (_: unknown, c: BillingComponentDto) => (
                        <Space size={0}>
                          <Button type="link" size="small" onClick={() => setComponent(c)}>
                            Edit
                          </Button>
                          <ConfirmDelete what={`${c.code} ${c.name}`} verb="Remove" description="Its parts and stages go with it." notice={false} onConfirm={() => removeComponent.mutateAsync(c.id)}>
                            <Button type="link" size="small" danger>
                              Remove
                            </Button>
                          </ConfirmDelete>
                        </Space>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Section>
      {data.components.length ? (
        <>
          <Section
            title="Milestone targets"
            extra={
              data.canEditTerms ? (
                <Button icon={<EditOutlined />} onClick={() => setGrid(true)}>
                  Edit targets
                </Button>
              ) : null
            }
          >
            <MilestoneGrid data={data} />
          </Section>
          <Section
            title="Withheld for slippage"
            extra={
              data.canEditTerms ? (
                <Button icon={<EditOutlined />} onClick={() => setTiers(true)}>
                  Edit tiers
                </Button>
              ) : null
            }
          >
            <Typography.Paragraph type="secondary">
              Each bill withholds, for every component behind its target, the tier&apos;s % of the work not done. It is released as the component catches up.
              {data.defaultTiers ? ' These are the usual tiers; set the contract’s own if it has them.' : ''}
            </Typography.Paragraph>
            <Table
              rowKey="fromPct"
              size="small"
              pagination={false}
              dataSource={data.tiers}
              style={{ maxWidth: 480 }}
              columns={[
                { title: 'Behind the target by', key: 'range', render: (_, t) => (t.toPct ? `${formatPct(t.fromPct)} to ${formatPct(t.toPct)}` : `${formatPct(t.fromPct)} or more`) },
                { title: 'Withheld', dataIndex: 'withheldPct', key: 'withheld', align: 'right', render: (v: string) => `${formatPct(v)} of the work not done` },
              ]}
            />
          </Section>
        </>
      ) : null}
      {data.canEdit ? <ComponentModal data={data} component={component} onClose={() => setComponent(null)} onSaved={saved} /> : null}
      {data.canEdit ? <StageModal projectId={projectId} epc={data.contractModel === 'EPC'} target={stage} onClose={() => setStage(null)} onSaved={saved} /> : null}
      {data.canEditTerms ? <TermsModal data={data} open={terms} onClose={() => setTerms(false)} onSaved={saved} /> : null}
      {data.canEditTerms ? <GridModal data={data} open={grid} onClose={() => setGrid(false)} onSaved={saved} /> : null}
      {data.canEditTerms ? <TiersModal data={data} open={tiers} onClose={() => setTiers(false)} onSaved={saved} /> : null}
    </>
  );
}

/** Targets against what was billed, month by month; a month behind its target shows in the error colour with "behind". */
function MilestoneGrid({ data }: { data: BillingBreakupDto }) {
  const today = dayjs().format('YYYY-MM-DD');
  const set = data.grid.some((r) => r.targets.some((t) => t !== null));
  if (!set) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.canEditTerms ? 'No targets yet. Edit targets to propose them from the schedule.' : 'No targets set yet'} />;
  return (
    <>
      <Typography.Paragraph type="secondary">Cumulative target / billed by the end of each month, % of the component. ▼ marks a month that ended behind its target.</Typography.Paragraph>
      <Table<MilestoneRowDto>
        rowKey="componentId"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content' }}
        dataSource={data.grid}
        columns={[
          {
            title: 'Component',
            key: 'name',
            fixed: 'left',
            render: (_, r) => (
              <span style={{ display: 'inline-block', minWidth: 120, maxWidth: 220 }}>
                <span className="mono" translate="no">
                  {r.code}
                </span>{' '}
                {r.name}
              </span>
            ),
          },
          ...data.months.map((m, i) => ({
            title: formatMonthShort(m),
            key: m,
            align: 'right' as const,
            render: (_: unknown, r: MilestoneRowDto) => {
              const target = r.targets[i];
              const actual = r.actual[i];
              const ended = dayjs(m).endOf('month').format('YYYY-MM-DD') <= today;
              const behind = ended && target !== null && actual !== null && actual < target - 0.05;
              return (
                <span className="mono" translate="no" style={{ whiteSpace: 'nowrap', color: behind ? themeColor('colorErrorText') : undefined }}>
                  {target === null ? '–' : Math.round(target)}
                  {actual !== null ? ` / ${Math.round(actual)}` : ''}
                  {behind ? (
                    <>
                      <span aria-hidden> ▼</span>
                      <span style={VISUALLY_HIDDEN}> behind</span>
                    </>
                  ) : null}
                </span>
              );
            },
          })),
        ]}
      />
    </>
  );
}

interface ComponentValues {
  code: string;
  name: string;
  parentId?: string | null;
  basis: 'STAGES' | 'UNIT_RATE';
  sharePct?: number | null;
}

function ComponentModal({ data, component, onClose, onSaved }: { data: BillingBreakupDto; component: BillingComponentDto | 'new' | null; onClose: () => void; onSaved: (d: BillingBreakupDto) => void }) {
  const [form] = Form.useForm<ComponentValues>();
  const { message } = App.useApp();
  const editing = component && component !== 'new' ? component : null;
  const basis = Form.useWatch('basis', form);
  useEffect(() => {
    if (!component) return;
    form.resetFields();
    form.setFieldsValue(editing ? { code: editing.code, name: editing.name, parentId: editing.parentId, basis: editing.basis, sharePct: editing.sharePct === null ? null : Number(editing.sharePct) } : { basis: 'STAGES' });
  }, [component, editing, form]);
  const save = useMutation({
    mutationFn: async (v: ComponentValues) =>
      (
        await api.put<BillingBreakupDto>(`/projects/${data.projectId}/billing-breakup/components`, {
          id: editing?.id,
          parentId: v.parentId ?? null,
          code: v.code,
          name: v.name,
          basis: v.basis,
          sharePct: v.basis === 'STAGES' ? numOrNull(v.sharePct) : null,
          workElementId: editing?.workElementId ?? null,
        })
      ).data,
    onSuccess: (d, v) => {
      onSaved(d);
      message.success(`${v.code} ${v.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  const parents = data.components.filter((c) => !c.parentId && c.basis === 'STAGES' && c.id !== editing?.id && !c.stages.length);
  return (
    <FormShell open={!!component} onClose={onClose} form={form} layout="modal" title={editing ? `Edit ${editing.code} ${editing.name}` : 'Add component'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={2}>
          <Form.Item name="code" label="Code" rules={[{ required: true, whitespace: true, message: 'Give it a code, e.g. 8.4' }]}>
            <Input maxLength={20} translate="no" />
          </Form.Item>
          <Form.Item name="parentId" label="Part of">
            <Select allowClear placeholder="None (a component of the contract)" options={parents.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the component' }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="basis" label="Paid by">
          <Segmented block options={(['STAGES', 'UNIT_RATE'] as const).map((b) => ({ value: b, label: BILLING_BASIS_LABELS[b] }))} />
        </Form.Item>
        {basis === 'STAGES' ? (
          <Form.Item name="sharePct" label="Share (%)" extra="Of the lump sum, or of its component for a part" rules={[{ required: true, message: 'Enter its share' }]}>
            <InputNumber min={0.0001} max={100} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}

interface StageValues {
  name: string;
  pct: number;
  trigger: StageTrigger;
  activityIds?: string[];
  itemIds?: string[];
  scopeQty?: number | null;
  achievedOn?: dayjs.Dayjs | null;
  evidence?: string | null;
  deliverableIds?: string[];
  packageIds?: string[];
  packageStage?: PackageStage | null;
}

function StageModal({ projectId, epc, target, onClose, onSaved }: { projectId: string; epc: boolean; target: { component: BillingComponentDto; stage: BillingStageDto | null } | null; onClose: () => void; onSaved: (d: BillingBreakupDto) => void }) {
  const [form] = Form.useForm<StageValues>();
  const { message } = App.useApp();
  const trigger = Form.useWatch('trigger', form);
  const deliverableIds = Form.useWatch('deliverableIds', form);
  const packageIds = Form.useWatch('packageIds', form);
  const byDeliverables = trigger === 'EVENT' && !!deliverableIds?.length;
  const byPackages = trigger === 'SUPPLY' && !!packageIds?.length;
  const [itemQ, setItemQ] = useState('');
  const activities = useActivities(target ? projectId : undefined);
  const epcData = useEpc(projectId, !!target && epc);
  const items = useStockItems(target && trigger === 'SUPPLY' && !byPackages ? { pageSize: 50, q: itemQ || undefined } : undefined);
  const s = target?.stage ?? null;
  useEffect(() => {
    if (!target) return;
    form.resetFields();
    form.setFieldsValue(
      s
        ? { name: s.name, pct: Number(s.pct), trigger: s.trigger, activityIds: s.activityIds, itemIds: s.itemIds, scopeQty: s.scopeQty === null ? null : Number(s.scopeQty), achievedOn: s.achievedOn ? dayjs(s.achievedOn) : null, evidence: s.evidence, deliverableIds: s.deliverableIds, packageIds: s.packageIds, packageStage: s.packageStage ?? 'DELIVERED' }
        : { trigger: 'PROGRESS', packageStage: 'DELIVERED' },
    );
  }, [target, s, form]);
  const elementId = target?.component.workElementId;
  const activityOptions = useMemo(
    () => (activities.data ?? []).filter((a) => !a.parentActivityId && (!elementId || a.workElementId === elementId)).map((a) => ({ value: a.id, label: a.name })),
    [activities.data, elementId],
  );
  const itemOptions = useMemo(() => {
    const named = new Map((s?.itemIds ?? []).map((id, i) => [id, s?.itemNames[i] ?? id]));
    for (const i of items.data?.items ?? []) named.set(i.id, `${i.name} (${i.unit})`);
    return [...named].map(([value, label]) => ({ value, label }));
  }, [items.data, s]);
  const deliverableOptions = useMemo(() => {
    const named = new Map((s?.deliverableIds ?? []).map((id, i) => [id, s?.deliverableNames[i] ?? id]));
    for (const d of epcData.data?.deliverables ?? []) named.set(d.id, `${d.code} ${d.title}`);
    return [...named].map(([value, label]) => ({ value, label }));
  }, [epcData.data, s]);
  const packageOptions = useMemo(() => {
    const named = new Map((s?.packageIds ?? []).map((id, i) => [id, s?.packageNames[i] ?? id]));
    for (const p of epcData.data?.packages ?? []) named.set(p.id, `${p.code} ${p.name}`);
    return [...named].map(([value, label]) => ({ value, label }));
  }, [epcData.data, s]);
  const save = useMutation({
    mutationFn: async (v: StageValues) =>
      (
        await api.put<BillingBreakupDto>(`/projects/${projectId}/billing-breakup/stages`, {
          id: s?.id,
          componentId: target!.component.id,
          name: v.name,
          pct: String(v.pct),
          trigger: v.trigger,
          activityIds: v.trigger === 'PROGRESS' || v.trigger === 'TEST' ? (v.activityIds ?? []) : [],
          itemIds: v.trigger === 'SUPPLY' && !v.packageIds?.length ? (v.itemIds ?? []) : [],
          scopeQty: v.trigger === 'SUPPLY' && !v.packageIds?.length ? numOrNull(v.scopeQty) : null,
          achievedOn: v.trigger === 'EVENT' && !v.deliverableIds?.length && v.achievedOn ? v.achievedOn.format('YYYY-MM-DD') : null,
          evidence: v.trigger === 'EVENT' && !v.deliverableIds?.length ? v.evidence?.trim() || null : null,
          deliverableIds: v.trigger === 'EVENT' ? (v.deliverableIds ?? []) : [],
          packageIds: v.trigger === 'SUPPLY' ? (v.packageIds ?? []) : [],
          packageStage: v.trigger === 'SUPPLY' && v.packageIds?.length ? (v.packageStage ?? 'DELIVERED') : null,
        })
      ).data,
    onSuccess: (d, v) => {
      onSaved(d);
      message.success(`Stage ${v.name} saved`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell
      open={!!target}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={target ? `${s ? 'Edit stage' : 'Add stage'} of ${target.component.code} ${target.component.name}` : ''}
      okText="Save"
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <FormGrid cols={2}>
          <Form.Item name="name" label="Stage" rules={[{ required: true, whitespace: true, message: 'Name the stage, e.g. Staging' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="pct" label="Of the component (%)" rules={[{ required: true, message: 'Enter its %' }]}>
            <InputNumber min={0.01} max={100} step={5} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="trigger" label="Paid" extra={trigger ? STAGE_TRIGGER_HINTS[trigger] : undefined}>
          <Select options={STAGE_TRIGGERS.map((t) => ({ value: t, label: STAGE_TRIGGER_LABELS[t] }))} />
        </Form.Item>
        {trigger === 'PROGRESS' || trigger === 'TEST' ? (
          <Form.Item name="activityIds" label="Activities it reads" extra="Leave empty to read the whole component">
            <Select mode="multiple" allowClear loading={activities.isLoading} options={activityOptions} showSearch={{ optionFilterProp: 'label' }} placeholder="The whole component" />
          </Form.Item>
        ) : null}
        {trigger === 'SUPPLY' && epc ? (
          <FormGrid cols={2}>
            <Form.Item name="packageIds" label="Equipment packages" extra="Paid by the share of their value that has reached the stage">
              <Select mode="multiple" allowClear loading={epcData.isLoading} options={packageOptions} showSearch={{ optionFilterProp: 'label' }} placeholder="None: read items received" />
            </Form.Item>
            {byPackages ? (
              <Form.Item name="packageStage" label="Once they are">
                <Select options={PACKAGE_STAGES.map((st) => ({ value: st, label: PACKAGE_STAGE_LABELS[st] }))} />
              </Form.Item>
            ) : null}
          </FormGrid>
        ) : null}
        {trigger === 'SUPPLY' && !byPackages ? (
          <FormGrid cols={2}>
            <Form.Item name="itemIds" label="Items received against it" rules={[{ required: true, message: 'Choose the pipe or equipment' }]}>
              <Select mode="multiple" options={itemOptions} loading={items.isFetching} showSearch={{ filterOption: false, onSearch: setItemQ }} placeholder="Search the item master" />
            </Form.Item>
            <Form.Item name="scopeQty" label="Scope" extra="In the items' unit; metres for pipe" rules={[{ required: true, message: 'Enter the quantity to supply' }]}>
              <InputNumber min={0.001} style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        ) : null}
        {trigger === 'EVENT' && epc ? (
          <Form.Item name="deliverableIds" label="Engineering deliverables" extra="Done on the day the last of them is approved">
            <Select mode="multiple" allowClear loading={epcData.isLoading} options={deliverableOptions} showSearch={{ optionFilterProp: 'label' }} placeholder="None: give the day it happened" />
          </Form.Item>
        ) : null}
        {trigger === 'EVENT' && !byDeliverables ? (
          <FormGrid cols={2}>
            <Form.Item name="achievedOn" label="Happened on" extra="Empty until it does">
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="evidence" label="Evidence" extra="The letter or certificate that says so">
              <Input maxLength={300} placeholder="e.g. EE letter SUWM/DES/114" />
            </Form.Item>
          </FormGrid>
        ) : null}
      </Form>
    </FormShell>
  );
}

interface TermsValues {
  lumpSumValue?: number | null;
  tenderFactor?: number | null;
  advanceRecoveryFromPct?: number | null;
  advanceRecoveryToPct?: number | null;
}

function TermsModal({ data, open, onClose, onSaved }: { data: BillingBreakupDto; open: boolean; onClose: () => void; onSaved: (d: BillingBreakupDto) => void }) {
  const [form] = Form.useForm<TermsValues>();
  const { message } = App.useApp();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      lumpSumValue: data.lumpSumSet ? inContract(toNumber(data.lumpSum), data) : null,
      tenderFactor: Number(data.tenderFactor),
      advanceRecoveryFromPct: data.advanceRecoveryFromPct === null ? null : Number(data.advanceRecoveryFromPct),
      advanceRecoveryToPct: data.advanceRecoveryToPct === null ? null : Number(data.advanceRecoveryToPct),
    });
  }, [open, data, form]);
  const save = useMutation({
    mutationFn: async (v: TermsValues) =>
      (
        await api.put<BillingBreakupDto>(`/projects/${data.projectId}/billing-breakup/terms`, {
          lumpSumValue: numOrNull(outOfContract(v.lumpSumValue, data)),
          tenderFactor: numOrNull(v.tenderFactor),
          advanceRecoveryFromPct: numOrNull(v.advanceRecoveryFromPct),
          advanceRecoveryToPct: numOrNull(v.advanceRecoveryToPct),
        })
      ).data,
    onSuccess: (d) => {
      onSaved(d);
      message.success('Billing terms saved');
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="Billing terms" okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="lumpSumValue" label="Lump sum the components share" extra="Empty takes the contract value. Leave out what unit-rate items are paid for.">
          <MoneyInput prefix={moneyPrefix(data)} />
        </Form.Item>
        <Form.Item name="tenderFactor" label="Tender factor (quoted ÷ estimate)" extra="Lump sum ÷ the estimate; unit-rate items are paid at their rate × this">
          <InputNumber min={0.5} max={2} step={0.0001} style={{ width: '100%' }} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="advanceRecoveryFromPct" label="Mobilisation advance recovered from (%)" extra="Of the contract executed; empty recovers a % of each bill">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="advanceRecoveryToPct"
            label="and finished by (%)"
            dependencies={['advanceRecoveryFromPct']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, v) => {
                  const from = getFieldValue('advanceRecoveryFromPct');
                  if ((from === null || from === undefined) !== (v === null || v === undefined)) return Promise.reject(new Error('Fill in both ends, or neither'));
                  if (v !== null && v !== undefined && v <= from) return Promise.reject(new Error('Finish after it starts'));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

type GridValues = { rows: Record<string, (number | null)[]> };

function GridModal({ data, open, onClose, onSaved }: { data: BillingBreakupDto; open: boolean; onClose: () => void; onSaved: (d: BillingBreakupDto) => void }) {
  const [form] = Form.useForm<GridValues>();
  const { message } = App.useApp();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ rows: Object.fromEntries(data.grid.map((r) => [r.componentId, r.targets])) });
  }, [open, data, form]);
  const propose = useMutation({
    mutationFn: async () => (await api.get<{ months: string[]; rows: { componentId: string; targets: number[] }[] }>(`/projects/${data.projectId}/billing-breakup/grid/proposal`)).data,
    onSuccess: (p) => {
      const rows: Record<string, (number | null)[]> = {};
      for (const r of p.rows) rows[r.componentId] = data.months.map((m) => r.targets[p.months.indexOf(m)] ?? null);
      form.setFieldsValue({ rows });
      message.info('Targets filled in from the schedule. Check them, then save.');
    },
    meta: FAIL_NOTICE,
  });
  const save = useMutation({
    mutationFn: async (v: GridValues) =>
      (
        await api.put<BillingBreakupDto>(`/projects/${data.projectId}/billing-breakup/grid`, {
          rows: data.grid.map((r) => ({
            componentId: r.componentId,
            targets: data.months.flatMap((m, i) => {
              const pct = v.rows?.[r.componentId]?.[i];
              return pct === null || pct === undefined ? [] : [{ month: m, pct: String(pct) }];
            }),
          })),
        })
      ).data,
    onSuccess: (d) => {
      onSaved(d);
      message.success('Milestone targets saved');
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1100}
      title="Milestone targets"
      okText="Save"
      onSubmit={(v) => save.mutateAsync(v)}
      footerExtra={
        <Button loading={propose.isPending} onClick={() => propose.mutate()}>
          Propose from the schedule
        </Button>
      }
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">Each component&apos;s cumulative target by the end of the month, % of its value. A target never falls from one month to the next.</Typography.Paragraph>
        <Table<MilestoneRowDto>
          rowKey="componentId"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={data.grid}
          columns={[
            { title: 'Component', key: 'name', fixed: 'left', render: (_, r) => <span style={{ whiteSpace: 'nowrap' }}>{r.code} {r.name}</span> },
            ...data.months.map((m, i) => ({
              title: formatMonthShort(m),
              key: m,
              render: (_: unknown, r: MilestoneRowDto) => (
                <Form.Item name={['rows', r.componentId, i]} noStyle>
                  <InputNumber min={0} max={100} style={{ width: 72 }} aria-label={`${r.code} target for ${formatMonthShort(m)}`} />
                </Form.Item>
              ),
            })),
          ]}
        />
      </Form>
    </FormShell>
  );
}

type TierValues = { tiers: { fromPct: number; toPct?: number | null; withheldPct: number }[] };

function TiersModal({ data, open, onClose, onSaved }: { data: BillingBreakupDto; open: boolean; onClose: () => void; onSaved: (d: BillingBreakupDto) => void }) {
  const [form] = Form.useForm<TierValues>();
  const { message } = App.useApp();
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ tiers: data.tiers.map((t) => ({ fromPct: Number(t.fromPct), toPct: t.toPct === null ? null : Number(t.toPct), withheldPct: Number(t.withheldPct) })) });
  }, [open, data, form]);
  const save = useMutation({
    mutationFn: async (v: TierValues) =>
      (await api.put<BillingBreakupDto>(`/projects/${data.projectId}/billing-breakup/tiers`, { tiers: (v.tiers ?? []).map((t) => ({ fromPct: String(t.fromPct), toPct: numOrNull(t.toPct), withheldPct: String(t.withheldPct) })) })).data,
    onSuccess: (d) => {
      onSaved(d);
      message.success('Slippage tiers saved');
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="Withheld for slippage" okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">Each tier starts where the one before ends; leave the last one open-ended. Remove them all to go back to the usual tiers.</Typography.Paragraph>
        <Form.List name="tiers">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Space key={f.key} align="start" wrap>
                  <Form.Item name={[f.name, 'fromPct']} label={f.name === 0 ? 'Behind by (%)' : undefined} rules={[{ required: true, message: 'Enter where it starts' }]}>
                    <InputNumber min={0} max={100} style={{ width: 110 }} aria-label="Behind by from" />
                  </Form.Item>
                  <Form.Item name={[f.name, 'toPct']} label={f.name === 0 ? 'to (%)' : undefined}>
                    <InputNumber min={0} max={100} style={{ width: 110 }} placeholder="or more" aria-label="Behind by to" />
                  </Form.Item>
                  <Form.Item name={[f.name, 'withheldPct']} label={f.name === 0 ? 'Withheld (%)' : undefined} rules={[{ required: true, message: 'Enter the %' }]}>
                    <InputNumber min={0} max={100} step={0.5} style={{ width: 110 }} aria-label="Withheld" />
                  </Form.Item>
                  <Button type="text" danger onClick={() => remove(f.name)} style={{ marginTop: f.name === 0 ? 30 : 0 }}>
                    Remove
                  </Button>
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add()} disabled={fields.length >= 10}>
                Add tier
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </FormShell>
  );
}

