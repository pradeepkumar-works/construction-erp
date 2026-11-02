'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { EmployeeDto, EmployeeEventDto, EmployeeEventType } from '@erp/shared';
import { EMPLOYEE_EVENT_LABELS, EMPLOYEE_EVENT_LETTERS, RECORDABLE_EVENT_TYPES, canViewEmployeePrivate, isExitEvent } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRecordEmployeeEvent } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { ProjectSelect } from '@/components/common/ProjectSelect';

interface FormValues {
  type: EmployeeEventType;
  effectiveDate: dayjs.Dayjs;
  toProjectId?: string | null;
  toDesignation?: string;
  toDepartment?: string;
  toCtc?: number | null;
  noticeGivenOn?: dayjs.Dayjs | null;
  note?: string;
}

const DATE = { style: { width: '100%' }, format: 'DD MMM YYYY' } as const;
const NOTE_LABEL: Partial<Record<EmployeeEventType, string>> = {
  OFFERED: 'Terms to add to the offer letter',
  WARNING: 'What the warning is about',
  RESIGNED: 'Reason for leaving',
  TERMINATED: 'Reason',
  RETIRED: 'Note',
};

/**
 * Record a step in someone's service: the offer, confirmation, transfer, promotion, increment, warning or exit. The
 * staff record changes to match, and the event gets its letter number. The offer waits for the joining documents.
 */
export function EmployeeEventModal({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee: EmployeeDto; onSaved?: (ev: EmployeeEventDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const money = !!user && canViewEmployeePrivate(user.roleKey);
  const type = Form.useWatch('type', form);
  const record = useRecordEmployeeEvent(employee.id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ type: employee.confirmedOn ? 'TRANSFERRED' : 'CONFIRMED', effectiveDate: dayjs() });
  }, [open, employee, form]);

  // A confirmation only once; an offer or an increment only for those who see pay.
  const types = RECORDABLE_EVENT_TYPES.filter((t) => (t !== 'CONFIRMED' || !employee.confirmedOn) && (money || (t !== 'INCREMENT' && t !== 'OFFERED')));
  const exit = !!type && isExitEvent(type);
  const ctcNow = employee.private?.ctcAnnual ?? null;

  const submit = async (v: FormValues) => {
    const ev = await record.mutateAsync({
      type: v.type,
      effectiveDate: v.effectiveDate.format('YYYY-MM-DD'),
      ...(v.type === 'TRANSFERRED' ? { toProjectId: v.toProjectId ?? null } : {}),
      ...(v.type === 'TRANSFERRED' || v.type === 'PROMOTED' || v.type === 'OFFERED' ? { toDesignation: v.toDesignation?.trim() || null, toDepartment: v.toDepartment?.trim() || null } : {}),
      ...((v.type === 'INCREMENT' || v.type === 'PROMOTED' || v.type === 'OFFERED') && v.toCtc != null ? { toCtc: v.toCtc } : {}),
      ...(v.type === 'RESIGNED' && v.noticeGivenOn ? { noticeGivenOn: v.noticeGivenOn.format('YYYY-MM-DD') } : {}),
      note: v.note?.trim() || null,
    });
    message.success(`${EMPLOYEE_EVENT_LABELS[ev.type]} recorded: ${EMPLOYEE_EVENT_LETTERS[ev.type].toLowerCase()} ${ev.letterNo}`);
    onSaved?.(ev);
    return ev;
  };

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={`Record for ${employee.fullName}`} okText="Record" onSubmit={submit} width={560} projectDefault={false}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="type" label="What happened" rules={[{ required: true, message: 'Choose what to record' }]}>
            <Select options={types.map((t) => ({ value: t, label: EMPLOYEE_EVENT_LABELS[t] }))} />
          </Form.Item>
          <Form.Item
            name="effectiveDate"
            label={exit ? 'Last working day' : type === 'OFFERED' ? 'Offered on' : 'From'}
            extra={type === 'OFFERED' && employee.joinedOn ? `On or before joining, ${formatDate(employee.joinedOn)}` : undefined}
            rules={[{ required: true, message: 'Choose the date it takes effect' }]}>
            <DatePicker {...DATE} />
          </Form.Item>
        </FormGrid>
        {type === 'TRANSFERRED' && (
          <Form.Item name="toProjectId" label="Transfer to" extra={`Now at ${employee.projectName ?? 'head office'}. Leave blank for head office.`}>
            <ProjectSelect placeholder="Head office" style={{ width: '100%' }} aria-label="Transfer to" />
          </Form.Item>
        )}
        {type === 'OFFERED' && (
          <FormGrid cols={2}>
            <Form.Item name="toDesignation" label="Position offered" extra={`On the record: ${employee.designation}`}>
              <Input maxLength={80} placeholder={employee.designation} />
            </Form.Item>
            <Form.Item name="toCtc" label="Cost to company a year" rules={[{ required: true, message: 'Enter the cost to company a year that is offered' }]}>
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        )}
        {(type === 'TRANSFERRED' || type === 'PROMOTED') && (
          <FormGrid cols={2}>
            <Form.Item
              name="toDesignation"
              label="New designation"
              extra={`Now ${employee.designation}`}
              rules={type === 'PROMOTED' ? [{ required: true, whitespace: true, message: 'Enter the new designation' }] : []}
            >
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="toDepartment" label="New department" extra={employee.department ? `Now ${employee.department}` : undefined}>
              <Input maxLength={80} />
            </Form.Item>
          </FormGrid>
        )}
        {money && (type === 'INCREMENT' || type === 'PROMOTED') && (
          <Form.Item
            name="toCtc"
            label="New cost to company a year"
            extra={ctcNow ? `Now ${formatINR(ctcNow)} a year` : 'No CTC recorded yet'}
            rules={type === 'INCREMENT' ? [{ required: true, message: 'Enter the new cost to company a year' }] : []}
          >
            <MoneyInput />
          </Form.Item>
        )}
        {type === 'RESIGNED' && (
          <Form.Item name="noticeGivenOn" label="Resignation handed in on" extra={employee.noticeDays ? `Notice period ${employee.noticeDays} days` : undefined}>
            <DatePicker {...DATE} />
          </Form.Item>
        )}
        {type && (
          <Form.Item
            name="note"
            label={NOTE_LABEL[type] ?? 'Note for the letter'}
            rules={type === 'WARNING' || type === 'TERMINATED' ? [{ required: true, whitespace: true, message: type === 'WARNING' ? 'Write what the warning is about' : 'Give the reason' }] : []}
          >
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        )}
        {type === 'OFFERED' && <Typography.Text type="secondary">The offer goes out only once every required joining document is verified or set aside.</Typography.Text>}
        {exit && <Typography.Text type="secondary">This marks them as left, with this as their last working day. Payroll settles their dues.</Typography.Text>}
      </Form>
    </FormShell>
  );
}
