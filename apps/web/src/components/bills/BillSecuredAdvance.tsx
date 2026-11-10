'use client';

import React, { useEffect, useState } from 'react';
import { HelpLink } from '@/components/common/Help';
import Link from 'next/link';
import { App, Button, Form, Input, Space, Table, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RaBillDto, RaBillSecuredAdvanceLineDto, SecuredAdvanceStockLineDto } from '@erp/shared';
import { securedAdvanceOf } from '@erp/shared';
import { EditOutlined, InboxOutlined } from '@/components/common/icons';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useContract } from '@/lib/queries';
import { formatMoney, formatPct, formatQty, toNumber } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { ItemPicker } from '@/components/form/ItemPicker';
import { tk } from '@/ds';

interface Line {
  itemId?: string | null;
  description?: string;
  unit?: string;
  qtyAtSite?: number | null;
  rate?: number | null;
}
interface FormValues {
  lines: Line[];
}

/**
 * The secured advance on a bill: the material at site it pays the contract's % on, and the previous bill's advance it
 * recovers. Filled in while the bill is not approved; a final or O&M bill takes none.
 */
export function BillSecuredAdvance({ bill, editable }: { bill: RaBillDto; editable: boolean }) {
  const { data: contract } = useContract(bill.projectId, editable);
  const [open, setOpen] = useState(false);
  const has = bill.securedAdvanceLines.length > 0;
  const pct = bill.status === 'APPROVED' ? bill.securedAdvancePct : (contract?.securedAdvancePct ?? bill.securedAdvancePct);
  const canFill = editable && !bill.isFinal && !bill.om && !!contract?.securedAdvancePct;
  const recovered = toNumber(bill.securedAdvanceRecovered);
  const m = (v: string | number) => (
    <span className="mono" translate="no">
      {formatMoney(v, bill, true)}
    </span>
  );

  return (
    <>
      {has ? (
        <Table<RaBillSecuredAdvanceLineDto>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={bill.securedAdvanceLines}
          scroll={{ x: 640 }}
          columns={[
            { title: 'Material at site', dataIndex: 'description' },
            { title: 'Quantity', dataIndex: 'qtyAtSite', width: 120, align: 'right', render: (v, l) => <span className="mono" translate="no">{formatQty(v)} {l.unit}</span> },
            { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right', render: (v) => m(v) },
            { title: 'Value', dataIndex: 'value', width: 130, align: 'right', render: (v) => m(v) },
            { title: `Advance @ ${formatPct(bill.securedAdvancePct)}`, dataIndex: 'advance', width: 140, align: 'right', render: (v) => <strong>{m(v)}</strong> },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <Typography.Text strong>Secured advance on this bill</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <strong>{m(bill.securedAdvance)}</strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {bill.om
            ? 'An O&M bill takes no secured advance.'
            : bill.isFinal
              ? 'A final bill pays no secured advance: by now the material is used.'
              : 'No material at site on this bill.'}
        </Typography.Paragraph>
      )}
      {recovered !== 0 ? (
        <Typography.Paragraph type="secondary">
          Recovers {formatMoney(recovered, bill, true)}, the previous bill&apos;s advance, as the material is now used or declared again above.
        </Typography.Paragraph>
      ) : null}
      {canFill ? (
        <Button size="small" icon={<EditOutlined />} onClick={() => setOpen(true)}>
          {has ? 'Change material at site' : 'Add material at site'}
        </Button>
      ) : editable && !bill.isFinal && !bill.om && contract && !contract.securedAdvancePct ? (
        <Typography.Paragraph type="secondary">
          The contract gives no secured advance. <Link href={`/projects/${bill.projectId}?tab=contract`}>Set its % on the contract terms</Link> to pay one on material at site.
        </Typography.Paragraph>
      ) : null}
      {canFill && pct ? <MaterialDrawer open={open} bill={bill} pct={pct} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MaterialDrawer({ open, bill, pct, onClose }: { open: boolean; bill: RaBillDto; pct: string; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const lines = Form.useWatch('lines', form) as Line[] | undefined;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      lines: bill.securedAdvanceLines.length
        ? bill.securedAdvanceLines.map((l) => ({ itemId: l.itemId, description: l.description, unit: l.unit, qtyAtSite: toNumber(l.qtyAtSite), rate: toNumber(l.rate) }))
        : [{}],
    });
  }, [open, bill, form]);

  const save = useMutation({
    mutationFn: async (body: object) => (await api.put<RaBillDto>(`/ra-bills/${bill.id}/secured-advance`, body)).data,
    onSuccess: (b) => {
      qc.setQueryData(['bills', 'detail', b.id], b);
      qc.invalidateQueries({ queryKey: ['bills'] });
      message.success(b.securedAdvanceLines.length ? `Secured advance of ${formatMoney(b.securedAdvance, b, true)} on ${b.billLabel}` : `Secured advance taken off ${b.billLabel}`);
    },
    meta: FAIL_NOTICE,
  });
  const stock = useMutation({
    mutationFn: async () => (await api.get<SecuredAdvanceStockLineDto[]>(`/ra-bills/${bill.id}/secured-advance/from-stock`)).data,
    onSuccess: (rows) => {
      if (!rows.length) return message.info('The site store had nothing in stock on the measurement date');
      form.setFieldsValue({ lines: rows.map((r) => ({ itemId: r.itemId, description: r.description, unit: r.unit, qtyAtSite: toNumber(r.qtyAtSite), rate: r.rate === null ? null : toNumber(r.rate) })) });
      message.info(`${rows.length} item${rows.length === 1 ? '' : 's'} from the store. Keep only the non-perishable material for the work, and check the quantities at site.`);
    },
    meta: FAIL_NOTICE,
  });

  const filled = (lines ?? []).filter((l) => l && toNumber(l.qtyAtSite ?? 0) > 0 && toNumber(l.rate ?? 0) > 0);
  const preview = securedAdvanceOf({ pct, lines: filled.map((l) => ({ description: l.description ?? '', unit: l.unit ?? '', qtyAtSite: l.qtyAtSite ?? 0, rate: l.rate ?? 0 })), previous: bill.securedAdvanceRecovered });

  const submit = (v: FormValues) =>
    save.mutateAsync({
      lines: (v.lines ?? [])
        .filter((l) => l && (l.description?.trim() || l.qtyAtSite))
        .map((l) => ({ itemId: l.itemId ?? null, description: l.description?.trim() ?? '', unit: l.unit?.trim() ?? '', qtyAtSite: String(l.qtyAtSite ?? 0), rate: String(l.rate ?? 0) })),
    });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={900}
      projectDefault={false}
      title={`Material at site on ${bill.billLabel}`}
      okText="Save"
      onSubmit={submit}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <HelpLink>Non-perishable material brought to site for the work and not yet used, at the rate it was bought. The bill pays {formatPct(pct)} of its value and recovers the previous bill&apos;s advance.</HelpLink>
          <Button size="small" icon={<InboxOutlined />} loading={stock.isPending} onClick={() => stock.mutate()}>
            Fill from stock
          </Button>
        </Space>
        <LineTable
          name="lines"
          label="Material"
          newLine={() => ({})}
          addText="Add material"
          columns={[
            {
              key: 'description',
              title: 'Material',
              render: (f) => (
                <>
                  <Form.Item name={[f.name, 'itemId']} hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Name the material' }]}>
                    <ItemPicker
                      placeholder="Cement OPC 53"
                      aria-label={`Material of line ${f.name + 1}`}
                      style={{ minWidth: 180 }}
                      maxLength={300}
                      unit={lines?.[f.name]?.unit}
                      onPick={(item) => {
                        form.setFieldValue(['lines', f.name, 'itemId'], item.id);
                        form.setFieldValue(['lines', f.name, 'unit'], item.unit);
                      }}
                    />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'unit',
              title: 'Unit',
              width: 100,
              render: (f) => (
                <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Give the unit' }]}>
                  <Input maxLength={30} aria-label={`Unit of line ${f.name + 1}`} />
                </Form.Item>
              ),
            },
            {
              key: 'qtyAtSite',
              title: 'Quantity at site',
              width: 150,
              render: (f) => (
                <Form.Item name={[f.name, 'qtyAtSite']} noStyle rules={[{ required: true, message: 'Enter the quantity at site' }]}>
                  <QuantityInput unit={lines?.[f.name]?.unit} aria-label={`Quantity at site of line ${f.name + 1}`} />
                </Form.Item>
              ),
            },
            {
              key: 'rate',
              title: 'Rate',
              width: 140,
              render: (f) => (
                <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate it was bought at' }]}>
                  <MoneyInput aria-label={`Rate of line ${f.name + 1}`} />
                </Form.Item>
              ),
            },
          ]}
        />
        <Typography.Paragraph style={{ marginTop: tk.space[3] }}>
          Advance <strong className="mono" translate="no">{formatMoney(preview.securedAdvance, bill, true)}</strong>, less{' '}
          <span className="mono" translate="no">{formatMoney(preview.recovered, bill, true)}</span> recovered: this bill&apos;s net payable moves by{' '}
          <strong className="mono" translate="no">{formatMoney(preview.net, bill, true)}</strong>.
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}
