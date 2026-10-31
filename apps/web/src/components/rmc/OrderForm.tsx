'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Segmented, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { RmcOrderDto } from '@erp/shared';
import { useMixDesigns, useRmcAction } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { ClientSelect } from '@/components/common/SearchSelect';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { usePlantScope } from './rmcUi';

interface Values {
  plantId: string;
  date: dayjs.Dayjs;
  for: 'client' | 'site';
  clientId?: string;
  projectId?: string;
  site?: string;
  mixDesignId: string;
  quantity: number;
  rate: number;
  pumped: boolean;
  pumpRate?: number | null;
  pourDate?: dayjs.Dayjs | null;
  validUntil?: dayjs.Dayjs | null;
  notes?: string;
}

/** A quote to a customer (or concrete for an own site); the same form changes an open order. */
export function OrderForm({ open, onClose, order, onSaved }: { open: boolean; onClose: () => void; order?: RmcOrderDto | null; onSaved?: (o: RmcOrderDto) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useRmcAction<RmcOrderDto>();
  const [scopePlant, , plants] = usePlantScope();
  const plantId = Form.useWatch('plantId', form);
  const who = Form.useWatch('for', form);
  const qty = Form.useWatch('quantity', form);
  const rate = Form.useWatch('rate', form);
  const pumpRate = Form.useWatch('pumpRate', form);
  const { data: designs } = useMixDesigns({ plantId }, open && !!plantId);
  const editing = !!order;
  useEffect(() => {
    if (!open) return;
    if (order)
      form.setFieldsValue({
        plantId: order.plantId,
        date: dayjs(order.date),
        for: order.clientId ? 'client' : 'site',
        clientId: order.clientId ?? undefined,
        projectId: order.projectId ?? undefined,
        site: order.site ?? undefined,
        mixDesignId: order.mixDesignId,
        quantity: Number(order.quantity),
        rate: Number(order.rate),
        pumpRate: order.pumpRate ? Number(order.pumpRate) : null,
        pourDate: order.pourDate ? dayjs(order.pourDate) : null,
        validUntil: order.validUntil ? dayjs(order.validUntil) : null,
        notes: order.notes ?? undefined,
      });
    else if (!form.getFieldValue('plantId')) form.setFieldsValue({ plantId: scopePlant ?? (plants.length === 1 ? plants[0].id : undefined) });
  }, [open, order, form, scopePlant, plants]);
  const value = (Number(qty) || 0) * ((Number(rate) || 0) + (Number(pumpRate) || 0));
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      projectDefault={false}
      title={editing ? `Edit ${order.orderNo}` : 'New RMC quote'}
      okText={editing ? 'Save' : 'Save quote'}
      draftKey={editing ? undefined : 'rmc-order'}
      footerExtra={value ? <Typography.Text type="secondary" translate="no">{`Value before GST ${formatINR(value, true)}`}</Typography.Text> : null}
      onSubmit={async (v) => {
        const body = {
          ...(editing ? {} : { plantId: v.plantId, clientId: v.for === 'client' ? v.clientId : null, projectId: v.for === 'site' ? v.projectId : null }),
          date: v.date.format('YYYY-MM-DD'),
          site: v.site?.trim() || null,
          mixDesignId: v.mixDesignId,
          quantity: v.quantity,
          rate: v.rate,
          pumpRate: v.pumpRate || null,
          pourDate: v.pourDate ? v.pourDate.format('YYYY-MM-DD') : null,
          validUntil: v.validUntil ? v.validUntil.format('YYYY-MM-DD') : null,
          notes: v.notes?.trim() || null,
        };
        const saved = await save.mutateAsync(editing ? { method: 'patch', path: `/rmc/orders/${order.id}`, body } : { path: '/rmc/orders', body });
        message.success(editing ? `${saved.orderNo} saved` : `Quote ${saved.orderNo} saved`);
        onSaved?.(saved);
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ date: dayjs(), for: 'client' }}>
        <FormGrid cols={2}>
          <Form.Item name="plantId" label="Plant" rules={[{ required: true, message: 'Choose the plant' }]}>
            <Select disabled={editing} options={plants.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} onChange={() => form.setFieldsValue({ mixDesignId: undefined })} />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Choose the date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="for" label="For">
          <Segmented
            disabled={editing}
            options={[
              { value: 'client', label: 'A customer' },
              { value: 'site', label: 'Our own site' },
            ]}
          />
        </Form.Item>
        <FormGrid cols={2}>
          {who === 'site' ? (
            <Form.Item name="projectId" label="Site" rules={[{ required: true, message: 'Choose the site the plant supplies' }]} extra="Supplied at cost, with no GST bill">
              <ProjectSelect allowClear={false} placeholder="Choose the project" disabled={editing} />
            </Form.Item>
          ) : (
            <Form.Item name="clientId" label="Customer" rules={[{ required: true, message: 'Choose the customer' }]} extra="Add a new customer in Masters, Clients">
              <ClientSelect disabled={editing} />
            </Form.Item>
          )}
          <Form.Item name="site" label="Pour at" extra="Where the trucks go">
            <Input maxLength={200} placeholder="Tower B raft, Patia" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="mixDesignId" label="Mix design" rules={[{ required: true, message: 'Choose the mix design' }]} extra="Quality approves a design before an order on it is confirmed">
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              disabled={!plantId}
              placeholder={plantId ? 'Choose a design' : 'Choose the plant first'}
              options={(designs ?? []).filter((d) => d.status !== 'RETIRED').map((d) => ({ value: d.id, label: `${d.grade} · ${d.code}${d.status === 'DRAFT' ? ' (waiting for approval)' : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Enter the cubic metres' }]}>
            <QuantityInput unit="m³" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="rate" label="Rate per m³" rules={[{ required: true, message: 'Enter the rate per m³' }]} extra="Before GST at 18%">
            <MoneyInput />
          </Form.Item>
          <Form.Item name="pumpRate" label="Pumping a cubic metre" extra="Leave empty when the customer pours by themselves">
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="pourDate" label="Pour on">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="validUntil" label="Quote valid until">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
