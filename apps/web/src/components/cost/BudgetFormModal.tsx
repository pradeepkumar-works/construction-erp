'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Select, Space, Table, Tooltip, Typography } from 'antd';
import { tk } from '@/ds';
import type { BudgetBoqItemDto, CostHead, ProjectBudgetDto } from '@erp/shared';
import { BUDGET_REVISION_OTHER, COST_HEADS, COST_HEAD_LABELS, unitLabel } from '@erp/shared';
import { useBudgetVersionSteps, useVariations } from '@/lib/queries';
import { formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Money } from '@/components/common/Money';
import { useMasterOptions } from '@/components/quality/NcrFormModal';

interface FormValues {
  heads: Partial<Record<CostHead, number | null>>;
  notes?: string;
  rates: Record<string, number | null>;
  reasonCode?: string | null;
  reasonNote?: string;
  variationId?: string | null;
}

const num = (v: string | null | undefined) => (v === null || v === undefined ? null : toNumber(v));

/**
 * Prepare a version of a project's budget: its cost heads and the budgeted cost per unit of its BOQ items, and for a
 * revision why it is revised. It edits the open version, or starts one from the version in force when none is open.
 */
export function BudgetFormModal({ open, onClose, budget }: { open: boolean; onClose: () => void; budget: ProjectBudgetDto }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const steps = useBudgetVersionSteps(budget.projectId);
  const [fillPct, setFillPct] = useState<number | null>(80);
  const heads = Form.useWatch('heads', form);
  const rates = Form.useWatch('rates', form);
  const reasonCode = Form.useWatch('reasonCode', form);
  const headTotal = COST_HEADS.reduce((s, h) => s + (heads?.[h] ?? 0), 0);
  const boqTotal = budget.boqItems.reduce((s, b) => s + toNumber(b.qty) * (rates?.[b.boqItemId] ?? 0), 0);

  const version = budget.open;
  const versionNo = version?.versionNo ?? Math.max(0, ...budget.versions.map((v) => v.versionNo)) + 1;
  const reasons = useMasterOptions('budget-revision', version?.reasonCode, open && versionNo > 1);
  const variations = useVariations({ projectId: budget.projectId, status: 'APPROVED', page: 1, pageSize: 100 }, open && reasonCode === 'variation');

  // What the version starts from: the open one's figures, else those in force (a new version copies them).
  const start = useMemo(() => {
    const lineRate = new Map(version?.lines.map((l) => [l.boqItemId, l.budgetRate]));
    return {
      heads: Object.fromEntries(COST_HEADS.map((h) => [h, num(version ? (version.heads?.[h] ?? null) : budget.heads.find((x) => x.head === h)?.budget)])) as Record<CostHead, number | null>,
      rates: Object.fromEntries(budget.boqItems.map((b) => [b.boqItemId, num(version ? lineRate.get(b.boqItemId) : b.budgetRate)])) as Record<string, number | null>,
      notes: (version ? version.notes : budget.notes) ?? undefined,
    };
  }, [version, budget]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ ...start, reasonCode: version?.reasonCode ?? null, reasonNote: version?.reasonNote ?? undefined, variationId: version?.variationId ?? null });
  }, [open, start, version, form]);

  const save = async (v: FormValues, submit: boolean) => {
    const anyHead = COST_HEADS.some((h) => v.heads?.[h] !== null && v.heads?.[h] !== undefined);
    const changed = budget.boqItems.filter((b) => start.rates[b.boqItemId] !== (v.rates?.[b.boqItemId] ?? null));
    const saved = await steps.save.mutateAsync({
      versionId: version?.id ?? null,
      heads: anyHead ? (Object.fromEntries(COST_HEADS.map((h) => [h, String(v.heads?.[h] ?? 0)])) as Record<CostHead, string>) : null,
      notes: v.notes?.trim() || null,
      items: changed.map((b) => ({ boqItemId: b.boqItemId, budgetRate: v.rates?.[b.boqItemId] === null || v.rates?.[b.boqItemId] === undefined ? null : String(v.rates[b.boqItemId]) })),
      ...(versionNo > 1 ? { reasonCode: v.reasonCode ?? null, reasonNote: v.reasonNote?.trim() || null, variationId: v.reasonCode === 'variation' ? (v.variationId ?? null) : null } : {}),
    });
    if (submit && saved.open) {
      await steps.submit.mutateAsync(saved.open.id);
      message.success(`Version ${versionNo} sent to management for approval`);
    } else message.success(`Version ${versionNo} saved as a draft`);
  };

  const fillRates = () => {
    if (!fillPct) return;
    const cur = form.getFieldValue('rates') ?? {};
    const next = { ...cur };
    for (const b of budget.boqItems) if (next[b.boqItemId] === null || next[b.boqItemId] === undefined) next[b.boqItemId] = Math.round(toNumber(b.rate) * fillPct) / 100;
    form.setFieldsValue({ rates: next });
  };

  const splitFromBoq = () => {
    if (boqTotal <= 0) return;
    const split: Record<CostHead, number> = { material: 0.44, subcontract: 0.2, machinery: 0.16, labour: 0.12, expenses: 0.08 };
    form.setFieldsValue({ heads: Object.fromEntries(COST_HEADS.map((h) => [h, Math.round(boqTotal * split[h])])) });
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={980}
      title={`Budget version ${versionNo}: ${budget.projectCode}`}
      okText="Save and send for approval"
      secondaryText="Save draft"
      onSubmit={(v, secondary) => save(v, !secondary)}
    >
      <Form form={form} layout="vertical">
        {versionNo > 1 && (
          <FormSection title="Why it is revised">
            <FormGrid cols={2}>
              <Form.Item name="reasonCode" label="Reason" rules={[{ required: true, message: 'Choose why the budget is revised' }]}>
                <Select options={reasons.options} placeholder="Variation, rate change…" />
              </Form.Item>
              {reasonCode === 'variation' && (
                <Form.Item name="variationId" label="Variation">
                  <Select
                    allowClear
                    placeholder="The approved variation it follows"
                    options={(variations.data?.items ?? []).map((x) => ({ value: x.id, label: `${x.label} · ${x.title}` }))}
                    loading={variations.isLoading}
                  />
                </Form.Item>
              )}
            </FormGrid>
            <Form.Item
              name="reasonNote"
              label="What changed"
              rules={[{ required: reasonCode === BUDGET_REVISION_OTHER, message: 'Say why the budget is revised' }]}
            >
              <Input.TextArea rows={2} maxLength={2000} placeholder="Steel and cement above the tender rates since July" />
            </Form.Item>
          </FormSection>
        )}
        <FormSection help={<>What the whole job should cost under each head of the cost view. This total is the budget at completion; without it, the BOQ budget below is used.</>} title="By cost head">
          <FormGrid cols={3}>
            {COST_HEADS.map((h) => (
              <Form.Item key={h} name={['heads', h]} label={COST_HEAD_LABELS[h]}>
                <MoneyInput />
              </Form.Item>
            ))}
          </FormGrid>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: tk.space[2], marginBottom: tk.space[4] }}>
            <Space wrap>
              <Tooltip title="Material 44%, subcontractors 20%, machinery 16%, labour 12%, site expenses 8%; adjust after">
                <Button size="small" onClick={splitFromBoq} disabled={boqTotal <= 0}>
                  Split the BOQ budget across heads
                </Button>
              </Tooltip>
              {headTotal > 0 && (
                <Button size="small" onClick={() => form.setFieldsValue({ heads: Object.fromEntries(COST_HEADS.map((h) => [h, null])) })}>
                  Clear the cost-head budget
                </Button>
              )}
            </Space>
            <Typography.Text strong>
              Total <Money value={headTotal} />
            </Typography.Text>
          </div>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Basis of the budget: tender rate analysis, revision after award, and so on" />
          </Form.Item>
        </FormSection>

        <FormSection title="BOQ budget rates">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: tk.space[2], marginBottom: tk.space[2] }}>
            <div className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
              Our cost per unit of each item, not the client&apos;s rate. It gives each item&apos;s planned margin.
            </div>
            <Space>
              <span style={{ fontSize: tk.type.caption.fontSize }}>Fill empty rates at</span>
              <InputNumber<number> size="small" min={1} max={200} value={fillPct} onChange={setFillPct} suffix="%" style={{ width: 90 }} aria-label="Fill empty rates at, % of the client's rate" />
              <span style={{ fontSize: tk.type.caption.fontSize }}>of the client&apos;s rate</span>
              <Button size="small" onClick={fillRates}>
                Fill
              </Button>
            </Space>
          </div>
          <Table<BudgetBoqItemDto>
            rowKey="boqItemId"
            size="small"
            pagination={false}
            dataSource={budget.boqItems}
            scroll={{ x: 820, y: 340 }}
            columns={[
              { title: 'Item', dataIndex: 'itemNo', width: 70, className: 'mono' },
              { title: 'Description', dataIndex: 'description', ellipsis: true },
              { title: 'Qty', dataIndex: 'qty', width: 120, align: 'right', render: (v, r) => <span className="mono" translate="no">{`${formatQty(v)} ${unitLabel(r.unit)}`}</span> },
              { title: 'Rate', dataIndex: 'rate', width: 140, align: 'right', render: (v) => <Money value={v} paise /> },
              {
                title: 'Budget rate',
                key: 'budgetRate',
                width: 150,
                render: (_, r) => (
                  <Form.Item name={['rates', r.boqItemId]} noStyle>
                    <MoneyInput size="small" aria-label={`Budget rate ${r.itemNo}`} />
                  </Form.Item>
                ),
              },
              { title: 'Budget', key: 'amount', width: 130, align: 'right', render: (_, r) => <span className="mono" translate="no">{rates?.[r.boqItemId] !== null && rates?.[r.boqItemId] !== undefined ? formatINR(toNumber(r.qty) * rates[r.boqItemId]!) : NO_VALUE}</span> },
            ]}
          />
          <div style={{ textAlign: 'right', marginTop: tk.space[2] }}>
            <Typography.Text strong>
              BOQ budget <Money value={boqTotal} />
            </Typography.Text>
          </div>
        </FormSection>
      </Form>
    </FormShell>
  );
}
