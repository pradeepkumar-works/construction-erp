'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Switch, Table, Typography } from 'antd';
import type { MixDesignDto, PlantBatchRowDto, RmcBatchDto, RmcOrderDto } from '@erp/shared';
import { useMixDesigns, useRmcAction } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, QuantityInput } from '@/components/form/inputs';
import { themeColor } from '@/lib/theme';
import { m3 } from './rmcUi';
import { unitLabel } from '@erp/shared';

interface DispatchValues {
  quantity: number;
  truck?: string;
  driver?: string;
  pumped: boolean;
  slumpMm?: number | null;
  note?: string;
  weighed?: Record<string, number | null>;
}

/**
 * A truck leaving the plant on an order: its challan, and the materials out of the plant's store at the design or as
 * weighed. From a batch the controller reported, the batch's cubic metres, truck and weights come filled in.
 */
export function DispatchForm({ order, row, onClose }: { order: RmcOrderDto | null; row?: PlantBatchRowDto; onClose: () => void }) {
  const [form] = Form.useForm<DispatchValues>();
  const { message } = App.useApp();
  const save = useRmcAction<RmcBatchDto>();
  const { data: designs } = useMixDesigns({ plantId: order?.plantId }, !!order);
  const design: MixDesignDto | undefined = designs?.find((d) => d.id === order?.mixDesignId);
  const qty = Number(Form.useWatch('quantity', form)) || 0;
  const left = order ? Math.max(0, Number(order.quantity) - Number(order.delivered) - Number(order.onTheWay)) : 0;
  useEffect(() => {
    if (!order) return;
    if (row)
      form.setFieldsValue({
        quantity: Number(row.quantity) || Math.min(6, left || 6),
        truck: row.truck ?? undefined,
        pumped: order.pumpRate !== null,
        weighed: Object.fromEntries(row.materials.map((m) => [m.itemId, Number(m.actualQty)])),
      });
    else form.setFieldsValue({ quantity: Math.min(6, left || 6), pumped: order.pumpRate !== null, weighed: {} });
  }, [order, row, form, left]);
  const notInDesign = row && design ? row.materials.filter((m) => !design.lines.some((l) => l.itemId === m.itemId)) : [];
  return (
    <FormShell
      open={!!order}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title={order ? (row?.batchNo ? `New challan for batch ${row.batchNo} · ${order.orderNo}` : `New challan · ${order.orderNo}`) : 'New challan'}
      okText="Save challan"
      onSubmit={async (v) => {
        const lines = Object.entries(v.weighed ?? {})
          .filter(([, q]) => q !== null && q !== undefined)
          .map(([itemId, actualQty]) => ({ itemId, actualQty }));
        const b = await save.mutateAsync({
          path: '/rmc/batches',
          body: { orderId: order!.id, plantRowId: row?.id, quantity: v.quantity, truck: v.truck?.trim().toUpperCase() || null, driver: v.driver?.trim() || null, pumped: v.pumped, slumpMm: v.slumpMm ?? null, note: v.note?.trim() || null, lines },
        });
        message.success(`${b.batchNo} on its way: ${m3(b.quantity)} to ${b.customer}`);
      }}
    >
      <Form form={form} layout="vertical">
        {order && (
          <Typography.Paragraph type="secondary">
            {`${order.grade} (${order.mixDesignCode}) for ${order.customer}${order.site ? `, ${order.site}` : ''}. ${m3(left)} of ${m3(order.quantity)} left to send.`}
            {row ? ` The controller's batch${row.batchNo ? ` ${row.batchNo}` : ''}${row.mix ? `, ${row.mix}` : ''}: its weights are filled in below.` : ''}
          </Typography.Paragraph>
        )}
        {notInDesign.length ? (
          <Typography.Paragraph style={{ color: themeColor('colorErrorText') }}>
            {`The controller weighed ${notInDesign.map((m) => m.itemName).join(', ')}, which ${order?.mixDesignCode ?? 'the design'} does not use. Check the order is the batch's.`}
          </Typography.Paragraph>
        ) : null}
        <FormGrid cols={3}>
          <Form.Item name="quantity" label="On the truck" rules={[{ required: true, message: 'Enter the cubic metres on the truck' }]}>
            <QuantityInput unit="m³" />
          </Form.Item>
          <Form.Item name="truck" label="Truck">
            <Input maxLength={30} placeholder="OD-02-AX-1101" {...CODE_INPUT} />
          </Form.Item>
          <Form.Item name="driver" label="Driver">
            <Input maxLength={80} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="pumped" label="Pumped at site" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="slumpMm" label="Slump at the plant">
            <InputNumber min={0} max={300} suffix="mm" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        {design && (
          <>
            <Typography.Text strong>Weighed at the batcher</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              Leave a material empty when it went at the design; enter the printout’s figure where it differs.
            </Typography.Paragraph>
            <Table
              rowKey="itemId"
              size="small"
              pagination={false}
              dataSource={design.lines}
              columns={[
                { title: 'Material', dataIndex: 'itemName' },
                { title: 'At the design', key: 'design', align: 'right', width: 150, render: (_, l) => <span translate="no">{`${formatQty(Number(l.quantity) * qty)} ${unitLabel(l.unit)}`}</span> },
                {
                  title: 'Weighed',
                  key: 'weighed',
                  width: 180,
                  render: (_, l) => (
                    <Form.Item name={['weighed', l.itemId]} noStyle>
                      <QuantityInput aria-label={`${l.itemName} weighed`} unit={l.unit} />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </>
        )}
        <Form.Item name="note" label="Note" style={{ marginTop: 16 }}>
          <Input maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The site received the truck (with who signed the challan), or turned it back (with why). */
export function DeliveryForm({ batch, rejecting, onClose }: { batch: RmcBatchDto | null; rejecting: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ receivedBy?: string; note?: string }>();
  const { message } = App.useApp();
  const save = useRmcAction<RmcBatchDto>();
  return (
    <FormShell
      open={!!batch}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={batch ? `${rejecting ? 'Turned back' : 'Delivered'}: ${batch.batchNo}` : ''}
      okText={rejecting ? 'Mark turned back' : 'Mark delivered'}
      onSubmit={async (v) => {
        const b = await save.mutateAsync(rejecting ? { path: `/rmc/batches/${batch!.id}/reject`, body: { note: v.note?.trim() } } : { path: `/rmc/batches/${batch!.id}/deliver`, body: { receivedBy: v.receivedBy?.trim(), note: v.note?.trim() || null } });
        message.success(rejecting ? `${b.batchNo} marked turned back; it will not be billed` : `${b.batchNo} delivered`);
      }}
    >
      <Form form={form} layout="vertical">
        {!rejecting && (
          <Form.Item name="receivedBy" label="Received by" rules={[{ required: true, whitespace: true, message: 'Enter who signed the challan at site' }]}>
            <Input maxLength={120} placeholder="Name and role" />
          </Form.Item>
        )}
        <Form.Item name="note" label={rejecting ? 'Why the site turned it back' : 'Note'} rules={rejecting ? [{ required: true, whitespace: true, message: 'Say why the site turned the truck back' }] : []}>
          <Input.TextArea rows={2} maxLength={500} placeholder={rejecting ? 'Slump 40 mm at site, asked for 120' : undefined} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
