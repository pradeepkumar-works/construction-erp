'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Form, Input, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { MAX_PAGE_SIZE, fuelNormText, meterUnit } from '@erp/shared';
import { useEquipment, useFuelIssue, useProjects, useStockBalances } from '@/lib/queries';
import { formatQty } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  equipmentId?: string;
  itemId?: string;
  quantity?: number;
  meterReading?: number | null;
  issuedTo?: string;
  remarks?: string;
}

/**
 * Fuel issue (v5 item 93): diesel from the site store into one machine, with its hour meter or odometer. It is an issue
 * slip like any other, so the stock goes down, and the machine's fuel norm, hire bill and the day's fuel position read it.
 */
export function FuelIssueModal({ open, onClose, projectId, equipmentId }: { open: boolean; onClose: () => void; projectId?: string; equipmentId?: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form);
  const scope = projectId ?? watchedProject;
  const chosenMachine = Form.useWatch('equipmentId', form);
  const chosenItem = Form.useWatch('itemId', form);
  const machines = useEquipment({ projectId: scope, pageSize: MAX_PAGE_SIZE, sortBy: 'code', sortOrder: 'asc' }, open && !!scope);
  const fuel = useStockBalances({ projectId: scope, fuel: true, inStock: true, pageSize: MAX_PAGE_SIZE }, open && !!scope);
  const fuels = useMemo(() => fuel.data?.items ?? [], [fuel.data]);
  const machine = machines.data?.items.find((m) => m.id === chosenMachine);
  const stock = fuels.find((f) => f.itemId === chosenItem);
  const save = useFuelIssue();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ projectId: projectId as string, date: dayjs(), equipmentId });
  }, [open, projectId, equipmentId, form]);

  // One fuel at the site (diesel, usually): pick it.
  useEffect(() => {
    if (open && fuels.length === 1 && !form.getFieldValue('itemId')) form.setFieldValue('itemId', fuels[0].itemId);
  }, [open, fuels, form]);

  const submit = async (v: FormValues) => {
    const e = await save.mutateAsync({
      projectId: v.projectId,
      date: v.date.format('YYYY-MM-DD'),
      equipmentId: v.equipmentId!,
      itemId: v.itemId!,
      quantity: String(v.quantity),
      meterReading: v.meterReading === null || v.meterReading === undefined ? null : String(v.meterReading),
      issuedTo: v.issuedTo?.trim() || null,
      remarks: v.remarks?.trim() || null,
    });
    message.success(`${e.entryNo} saved: ${formatQty(Math.abs(Number(e.lines[0]?.quantity ?? v.quantity ?? 0)))} ${e.lines[0]?.unit ?? ''} into ${e.equipmentCode ?? 'the machine'}`);
    return e;
  };

  const unit = meterUnit(machine?.fuelNormUnit);
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={640} title="Fuel issue" okText="Save fuel issue" onSubmit={submit}>
      <Form form={form} layout="vertical">
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!projectId}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Select project"
            onChange={() => form.setFieldsValue({ equipmentId: undefined, itemId: undefined })}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="equipmentId" label="Machine" rules={[{ required: true, message: 'Choose the machine the fuel went into' }]} extra={machine?.fuelNorm && machine.fuelNormUnit ? `Norm ${fuelNormText(machine.fuelNorm, machine.fuelNormUnit)}` : undefined}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder={scope ? 'Machine on this site' : 'Pick the project first'}
              disabled={!scope}
              loading={machines.isLoading}
              options={(machines.data?.items ?? []).map((m) => ({ value: m.id, label: `${m.code} - ${m.name}` }))}
            />
          </Form.Item>
          <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="itemId" label="Fuel" rules={[{ required: true, message: 'Choose the fuel' }]}>
            <Select
              placeholder={scope ? 'Fuel in the store' : 'Pick the project first'}
              disabled={!scope}
              loading={fuel.isLoading}
              options={fuels.map((f) => ({ value: f.itemId, label: `${f.itemName} (${formatQty(f.balance)} ${f.unit} in stock)` }))}
            />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[
              { required: true, message: 'Enter how much went in' },
              { validator: (_, v) => (!v || Number(v) > 0 ? Promise.resolve() : Promise.reject(new Error('Enter more than zero'))) },
              { validator: (_, v) => (!v || !stock || Number(v) <= Number(stock.balance) ? Promise.resolve() : Promise.reject(new Error(`Only ${formatQty(stock.balance)} ${stock.unit} in stock`))) },
            ]}
          >
            <QuantityInput unit={stock?.unit ?? 'Ltr'} />
          </Form.Item>
          <Form.Item name="meterReading" label={unit === 'km' ? 'Odometer' : 'Hour meter'} extra="Reading when it was filled; it checks the machine's fuel use">
            <QuantityInput unit={unit} precision={1} />
          </Form.Item>
          <Form.Item name="issuedTo" label="Handed to">
            <Input maxLength={120} placeholder="The operator or driver; the machine when left blank" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        {scope && !fuel.isLoading && !fuels.length ? (
          <Alert type="warning" showIcon title="No fuel in stock at this project. Receive diesel first, or mark the item as fuel in Items." />
        ) : null}
      </Form>
    </FormShell>
  );
}
