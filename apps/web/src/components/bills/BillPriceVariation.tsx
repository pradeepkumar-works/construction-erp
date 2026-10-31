'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, App, Button, Divider, Form, Input, InputNumber, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { EditOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RaBillDto, RaBillPvLineDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useContract } from '@/lib/queries';
import { formatINR, formatPct, toNumber, formatMonth, MONTH_PICKER_FORMAT } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

interface FormValues {
  indexMonth?: dayjs.Dayjs | null;
  note?: string;
  current: Record<string, number | null | undefined>;
}

/**
 * Price variation on an RA bill (v4 item 50): this bill's index for each component of the contract's formula and what
 * it adds to (or takes off) the work value. Filled in while the bill is not approved.
 */
export function BillPriceVariation({ bill, editable }: { bill: RaBillDto; editable: boolean }) {
  const { data: contract } = useContract(bill.projectId, editable);
  const [open, setOpen] = useState(false);
  const has = bill.pvLines.length > 0;
  const canFill = editable && !!contract?.priceVariation;
  if (!has && !canFill) return null;
  return (
    <>
      <Divider titlePlacement="start" plain>
        Price variation
      </Divider>
      {has ? (
        <Table<RaBillPvLineDto>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={bill.pvLines}
          className="bill-pv"
          title={() => (
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
              <Typography.Text type="secondary">
                On this bill&apos;s work done of {formatINR(bill.grossAmount, true)}
                {bill.pvIndexMonth ? `, indices for ${formatMonth(bill.pvIndexMonth)}` : ''}
                {bill.pvNote ? ` (${bill.pvNote})` : ''}
              </Typography.Text>
              {canFill ? (
                <Button size="small" icon={<EditOutlined />} onClick={() => setOpen(true)}>
                  Change indices
                </Button>
              ) : null}
            </Space>
          )}
          columns={[
            { title: 'Component', dataIndex: 'name' },
            { title: 'Share', dataIndex: 'sharePct', align: 'right', render: (v: string) => formatPct(v) },
            { title: 'Base index', dataIndex: 'baseIndex', align: 'right', render: (v: string) => <span className="mono" translate="no">{v}</span> },
            { title: 'This bill', dataIndex: 'currentIndex', align: 'right', render: (v: string) => <span className="mono" translate="no">{v}</span> },
            {
              title: 'Amount',
              dataIndex: 'amount',
              align: 'right',
              render: (v: string) => (
                <Typography.Text strong type={toNumber(v) < 0 ? 'danger' : undefined} className="mono">
                  {formatINR(v, true)}
                </Typography.Text>
              ),
            },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <Typography.Text strong>Price variation</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                <Typography.Text strong className="mono">
                  {formatINR(bill.pvAmount, true)}
                </Typography.Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      ) : contract && contract.pvComponents.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="The contract has a price variation clause but no formula yet."
          description={<Link href={`/projects/${bill.projectId}?tab=contract`}>Add its components on the contract tab</Link>}
        />
      ) : (
        <Space wrap>
          <Typography.Text type="secondary">The contract has a price variation clause. Enter this bill&apos;s indices to add it.</Typography.Text>
          <Button size="small" type="primary" ghost onClick={() => setOpen(true)}>
            Enter indices
          </Button>
        </Space>
      )}
      {canFill && contract ? <IndicesModal open={open} bill={bill} components={contract.pvComponents} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function IndicesModal({ open, bill, components, onClose }: { open: boolean; bill: RaBillDto; components: { id: string; name: string; sharePct: string; baseIndex: string }[]; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const byName = new Map(bill.pvLines.map((l) => [l.name, Number(l.currentIndex)]));
    form.setFieldsValue({
      indexMonth: bill.pvIndexMonth ? dayjs(bill.pvIndexMonth) : dayjs(bill.billDate).subtract(1, 'month').startOf('month'),
      note: bill.pvNote ?? undefined,
      current: Object.fromEntries(components.map((c) => [c.id, byName.get(c.name)])),
    });
  }, [open, bill, components, form]);

  const save = useMutation({
    mutationFn: async (body: object) => (await api.put<RaBillDto>(`/ra-bills/${bill.id}/price-variation`, body)).data,
    onSuccess: (b) => {
      qc.setQueryData(['bills', 'detail', b.id], b);
      qc.invalidateQueries({ queryKey: ['bills'] });
      message.success(b.pvLines.length ? `Price variation ${formatINR(b.pvAmount, true)} added to ${b.billLabel}` : `Price variation taken off ${b.billLabel}`);
    },
    meta: FAIL_NOTICE,
  });

  const submit = (v: FormValues) =>
    save.mutateAsync({
      indexMonth: v.indexMonth ? v.indexMonth.startOf('month').format('YYYY-MM-DD') : null,
      note: v.note?.trim() || null,
      indices: components.map((c) => ({ componentId: c.id, currentIndex: String(v.current[c.id]) })),
    });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title={`Price variation on ${bill.billLabel}`}
      okText="Save"
      onSubmit={submit}
      footerExtra={
        bill.pvLines.length ? (
          <ConfirmDelete verb="Remove" what="the price variation from this bill" notice={false} onConfirm={() => save.mutateAsync({ indices: [] })} onDone={onClose}>
            <Button danger loading={save.isPending}>
              Remove
            </Button>
          </ConfirmDelete>
        ) : null
      }
    >
      <Form form={form} layout="vertical" className="bill-pv-form" requiredMark="optional">
        <FormGrid cols={2}>
          <Form.Item name="indexMonth" label="Indices for" rules={[{ required: true, message: 'Choose the month' }]}>
            <DatePicker picker="month" format={MONTH_PICKER_FORMAT} allowClear={false} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Source" extra="e.g. RBI WPI, provisional">
            <Input maxLength={300} />
          </Form.Item>
        </FormGrid>
        {components.map((c) => (
          <Form.Item
            key={c.id}
            name={['current', c.id]}
            label={`${c.name} (${formatPct(c.sharePct)} share, base ${c.baseIndex})`}
            rules={[{ required: true, message: `Enter the ${c.name.toLowerCase()} index` }]}
          >
            <InputNumber min={0.001} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        ))}
      </Form>
    </FormShell>
  );
}
