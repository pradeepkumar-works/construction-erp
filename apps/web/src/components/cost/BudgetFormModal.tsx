'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Space, Table, Tooltip, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BudgetBoqItemDto, CostHead, ProjectBudgetDto } from '@erp/shared';
import { COST_HEADS, COST_HEAD_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatINR, formatQty, toNumber } from '@/lib/format';

interface FormValues {
  heads: Partial<Record<CostHead, number | null>>;
  notes?: string;
  rates: Record<string, number | null>;
}

const rupees = { formatter: (v?: number | string) => (v === undefined || v === null || v === '' ? '' : Number(v).toLocaleString('en-IN')), parser: (v?: string) => Number((v ?? '').replace(/[^\d.]/g, '')) };

/** Set a project's budget by cost head and the budgeted cost per unit of its BOQ items. */
export function BudgetFormModal({ open, onClose, budget }: { open: boolean; onClose: () => void; budget: ProjectBudgetDto }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [fillPct, setFillPct] = useState<number | null>(80);
  const heads = Form.useWatch('heads', form);
  const rates = Form.useWatch('rates', form);
  const headTotal = COST_HEADS.reduce((s, h) => s + (heads?.[h] ?? 0), 0);
  const boqTotal = budget.boqItems.reduce((s, b) => s + toNumber(b.qty) * (rates?.[b.boqItemId] ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      heads: Object.fromEntries(budget.heads.map((h) => [h.head, h.budget === null ? null : toNumber(h.budget)])),
      notes: budget.notes ?? undefined,
      rates: Object.fromEntries(budget.boqItems.map((b) => [b.boqItemId, b.budgetRate === null ? null : toNumber(b.budgetRate)])),
    });
  }, [open, budget, form]);

  const save = useMutation({
    mutationFn: async ({ v, clearHeads }: { v: FormValues; clearHeads?: boolean }) => {
      const anyHead = COST_HEADS.some((h) => v.heads?.[h] !== null && v.heads?.[h] !== undefined);
      const changed = budget.boqItems.filter((b) => (b.budgetRate === null ? null : toNumber(b.budgetRate)) !== (v.rates?.[b.boqItemId] ?? null));
      const body = {
        heads: clearHeads ? null : anyHead ? Object.fromEntries(COST_HEADS.map((h) => [h, String(v.heads?.[h] ?? 0)])) : undefined,
        notes: v.notes?.trim() || null,
        items: changed.map((b) => ({ boqItemId: b.boqItemId, budgetRate: v.rates?.[b.boqItemId] === null || v.rates?.[b.boqItemId] === undefined ? null : String(v.rates[b.boqItemId]) })),
      };
      return (await api.put<ProjectBudgetDto>(`/cost/projects/${budget.projectId}/budget`, body)).data;
    },
    onSuccess: () => {
      message.success('Budget saved');
      qc.invalidateQueries({ queryKey: ['cost'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

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
    <Modal
      open={open}
      title={`Budget: ${budget.projectCode}`}
      okText="Save"
      onCancel={onClose}
      onOk={() => form.validateFields().then((v) => save.mutate({ v }))}
      confirmLoading={save.isPending}
      width={980}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Typography.Text strong>By cost head</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          What the whole job should cost under each head of the cost view. This total is the budget at completion; without it, the BOQ budget below is used.
        </Typography.Paragraph>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 12px' }}>
          {COST_HEADS.map((h) => (
            <Form.Item key={h} name={['heads', h]} label={`${COST_HEAD_LABELS[h]} (₹)`}>
              <InputNumber<number> style={{ width: '100%' }} min={0} {...rupees} />
            </Form.Item>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <Space wrap>
            <Tooltip title="Material 44%, subcontractors 20%, machinery 16%, labour 12%, site expenses 8%; adjust after">
              <Button size="small" onClick={splitFromBoq} disabled={boqTotal <= 0}>
                Split the BOQ budget across heads
              </Button>
            </Tooltip>
            {budget.hasHeadBudget && (
              <Button size="small" danger onClick={() => form.validateFields().then((v) => save.mutate({ v, clearHeads: true }))}>
                Remove the cost-head budget
              </Button>
            )}
          </Space>
          <Typography.Text strong>
            Total <span className="mono">{formatINR(headTotal)}</span>
          </Typography.Text>
        </div>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={2000} placeholder="Basis of the budget: tender rate analysis, revision after award, and so on" />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div>
            <Typography.Text strong>BOQ budget rates</Typography.Text>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Our cost per unit of each item, not the client&apos;s rate. It gives each item&apos;s planned margin.
            </div>
          </div>
          <Space>
            <span style={{ fontSize: 12 }}>Fill empty rates at</span>
            <InputNumber<number> size="small" min={1} max={200} value={fillPct} onChange={setFillPct} suffix="%" style={{ width: 90 }} />
            <span style={{ fontSize: 12 }}>of the client&apos;s rate</span>
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
            { title: 'Qty', dataIndex: 'qty', width: 120, align: 'right', render: (v, r) => <span className="mono">{`${formatQty(v)} ${r.unit}`}</span> },
            { title: 'Rate', dataIndex: 'rate', width: 140, align: 'right', render: (v) => <span className="mono">{formatINR(v, true)}</span> },
            {
              title: 'Budget rate (₹)',
              key: 'budgetRate',
              width: 150,
              render: (_, r) => (
                <Form.Item name={['rates', r.boqItemId]} noStyle>
                  <InputNumber<number> size="small" min={0} style={{ width: '100%' }} aria-label={`Budget rate ${r.itemNo}`} />
                </Form.Item>
              ),
            },
            { title: 'Budget', key: 'amount', width: 130, align: 'right', render: (_, r) => <span className="mono">{rates?.[r.boqItemId] !== null && rates?.[r.boqItemId] !== undefined ? formatINR(toNumber(r.qty) * rates[r.boqItemId]!) : '-'}</span> },
          ]}
        />
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <Typography.Text strong>
            BOQ budget <span className="mono">{formatINR(boqTotal)}</span>
          </Typography.Text>
        </div>
      </Form>
    </Modal>
  );
}
