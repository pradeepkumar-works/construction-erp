'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, DatePicker, Empty, Form, Input, InputNumber, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PriceVariationComponentDto, ProjectContractDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatDate } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';

interface FormValues {
  pvBaseDate?: dayjs.Dayjs | null;
  components: { name?: string; sharePct?: number | null; baseIndex?: number | null }[];
}

/** Common components of a works price variation clause, offered as names to start from. */
const SUGGESTED = ['Cement', 'Steel', 'Bitumen', 'Fuel (HSD)', 'Labour', 'Other materials', 'Plant and machinery'];

const fixedShare = (shares: (number | null | undefined)[]) => Math.max(0, 100 - shares.reduce<number>((s, v) => s + (Number(v) || 0), 0));

/**
 * The price variation formula of a contract (v4 item 50): each component's share of the work value and its index on the
 * base date. Bills take this month's index for each and add work value × share × (current − base) / base.
 */
export function PriceVariationCard({ contract, editable }: { contract: ProjectContractDto; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const rows = contract.pvComponents;
  const fixed = fixedShare(rows.map((r) => Number(r.sharePct)));
  return (
    <>
      <Table<PriceVariationComponentDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        className="pv-formula"
        title={() => (
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary">
              Base indices as on {contract.pvBaseDate ? formatDate(contract.pvBaseDate) : 'a date not set yet'}. Each bill adds work value × share × (current index − base) ÷ base.
            </Typography.Text>
            {editable ? (
              <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
                Edit formula
              </Button>
            ) : null}
          </Space>
        )}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No components yet. Add the ones in the contract's price variation clause." /> }}
        columns={[
          { title: 'Component', dataIndex: 'name' },
          { title: 'Share of the work value', dataIndex: 'sharePct', align: 'right', render: (v: string) => `${v}%` },
          { title: 'Base index', dataIndex: 'baseIndex', align: 'right' },
        ]}
        summary={() =>
          rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <Typography.Text type="secondary">Fixed (does not move)</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Typography.Text type="secondary">{Number(fixed.toFixed(2))}%</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} />
            </Table.Summary.Row>
          ) : null
        }
      />
      {editable ? <PriceVariationModal open={editing} contract={contract} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function PriceVariationModal({ open, contract, onClose }: { open: boolean; contract: ProjectContractDto; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const shares = Form.useWatch('components', form)?.map((c) => c?.sharePct) ?? [];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      pvBaseDate: contract.pvBaseDate ? dayjs(contract.pvBaseDate) : null,
      components: contract.pvComponents.length
        ? contract.pvComponents.map((c) => ({ name: c.name, sharePct: Number(c.sharePct), baseIndex: Number(c.baseIndex) }))
        : [{ name: 'Cement' }, { name: 'Steel' }],
    });
  }, [open, contract, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.put<ProjectContractDto>(`/projects/${contract.projectId}/contract/price-variation`, {
          pvBaseDate: v.pvBaseDate ? v.pvBaseDate.format('YYYY-MM-DD') : null,
          components: (v.components ?? []).map((c) => ({ name: c.name?.trim(), sharePct: String(c.sharePct), baseIndex: String(c.baseIndex) })),
        })
      ).data,
    onSuccess: (d) => {
      qc.setQueryData(['contract', contract.projectId], d);
      message.success('Price variation formula saved');
    },
    meta: FAIL_NOTICE,
  });

  const total = 100 - fixedShare(shares);
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="Price variation formula" okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical" className="pv-form" requiredMark="optional">
        <Form.Item name="pvBaseDate" label="Base date" extra="Usually the month before the bids were due; the base indices are for this date">
          <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.List name="components">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f) => (
                <Space key={f.key} align="start" wrap>
                  <Form.Item name={[f.name, 'name']} label={f.name === 0 ? 'Component' : undefined} rules={[{ required: true, whitespace: true, message: 'Name the component' }]}>
                    <Input maxLength={80} placeholder="Cement" list="pv-suggestions" style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'sharePct']} label={f.name === 0 ? 'Share (%)' : undefined} rules={[{ required: true, message: 'Enter the share' }]}>
                    <InputNumber min={0.01} max={100} step={1} style={{ width: 120 }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'baseIndex']} label={f.name === 0 ? 'Base index' : undefined} rules={[{ required: true, message: 'Enter the base index' }]}>
                    <InputNumber min={0.001} step={0.1} style={{ width: 140 }} />
                  </Form.Item>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove component" onClick={() => remove(f.name)} style={{ marginTop: f.name === 0 ? 30 : 0 }} />
                </Space>
              ))}
              <datalist id="pv-suggestions">
                {SUGGESTED.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Button icon={<PlusOutlined />} onClick={() => add()} disabled={fields.length >= 12}>
                  Add component
                </Button>
                <Typography.Text type={total > 100 ? 'danger' : 'secondary'}>
                  {total > 100 ? `Shares add up to ${Number(total.toFixed(2))}%, more than 100%` : `Fixed part: ${Number((100 - total).toFixed(2))}%`}
                </Typography.Text>
              </Space>
            </>
          )}
        </Form.List>
      </Form>
    </FormShell>
  );
}
