'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, App, Checkbox, DatePicker, Form, Input, Modal, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import type { LeaveRequestDto, LeaveType } from '@erp/shared';
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, canManageStaff, leaveDays } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEmployees, useHolidays, useLeaveBalances, useMyStaff } from '@/lib/queries';
import { days } from './staffUi';
import { inSentence } from '@/lib/format';

interface FormValues {
  employeeId?: string;
  type: LeaveType;
  fromDate: dayjs.Dayjs;
  toDate: dayjs.Dayjs;
  halfDay?: boolean;
  reason: string;
}

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

/**
 * Apply for leave: for yourself, or (HR) for someone else. Shows the working days it takes (Sundays and holidays are
 * not counted) and what is left of that leave for the year.
 */
export function LeaveFormModal({ open, onClose, employeeId: fixedEmployee, onSaved }: { open: boolean; onClose: () => void; employeeId?: string; onSaved?: (l: LeaveRequestDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { user } = useAuth();
  const admin = !!user && canManageStaff(user.roleKey);
  const { data: me } = useMyStaff();
  const { data: staff } = useEmployees({ pageSize: 200, sortBy: 'fullName' }, open && admin && !fixedEmployee);
  const chosen = Form.useWatch('employeeId', form) ?? fixedEmployee ?? me?.employee?.id;
  const type = Form.useWatch('type', form);
  const from = Form.useWatch('fromDate', form);
  const to = Form.useWatch('toDate', form);
  const halfDay = Form.useWatch('halfDay', form);
  const employee = chosen === me?.employee?.id ? me?.employee : staff?.items.find((e) => e.id === chosen);
  const year = from ? from.year() : dayjs().year();
  const { data: balances } = useLeaveBalances(chosen === me?.employee?.id ? undefined : chosen, year, open && !!chosen);
  const { data: holidays } = useHolidays(year, employee?.projectId ?? undefined);

  const taking = useMemo(() => {
    if (!from || !to || to.isBefore(from, 'day')) return null;
    const off = new Set((holidays ?? []).map((h) => h.date));
    return leaveDays(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), !!halfDay && from.isSame(to, 'day'), off);
  }, [from, to, halfDay, holidays]);
  const balance = balances?.find((b) => b.type === type);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ employeeId: fixedEmployee, type: 'CASUAL' });
  }, [open, fixedEmployee, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.post<LeaveRequestDto>('/staff/leave', {
          employeeId: v.employeeId ?? fixedEmployee,
          type: v.type,
          fromDate: v.fromDate.format('YYYY-MM-DD'),
          toDate: v.toDate.format('YYYY-MM-DD'),
          halfDay: !!v.halfDay && v.fromDate.isSame(v.toDate, 'day'),
          reason: v.reason.trim(),
        })
      ).data,
    onSuccess: (l) => {
      message.success(`Leave applied: ${days(l.days)}`);
      qc.invalidateQueries({ queryKey: ['staff'] });
      onSaved?.(l);
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const noRecord = open && !admin && me && !me.employee;
  return (
    <Modal open={open} title="Apply for leave" okText="Apply" onCancel={onClose} onOk={() => form.submit()} okButtonProps={{ disabled: !!noRecord }} confirmLoading={mutation.isPending} width={560} destroyOnHidden>
      {noRecord && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Your login is not linked to a staff record. Ask HR to link it." />}
      <Form form={form} layout="vertical" onFinish={(v) => mutation.mutate(v)} style={{ marginTop: 8 }}>
        {admin && !fixedEmployee && (
          <Form.Item name="employeeId" label="Employee" extra="Leave blank to apply for yourself">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.fullName} (${e.employeeCode})` }))} />
          </Form.Item>
        )}
        <Form.Item name="type" label="Leave" rules={[{ required: true, message: 'Required' }]}>
          <Select options={LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] }))} />
        </Form.Item>
        <div style={grid('1fr 1fr')}>
          <Form.Item name="fromDate" label="From" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker
              style={{ width: '100%' }}
              format="DD MMM YYYY"
              onChange={(d) => {
                const end = form.getFieldValue('toDate') as dayjs.Dayjs | undefined;
                if (d && (!end || end.isBefore(d, 'day'))) form.setFieldsValue({ toDate: d });
              }}
            />
          </Form.Item>
          <Form.Item name="toDate" label="To" rules={[{ required: true, message: 'Required' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => !!from && d.isBefore(from, 'day')} />
          </Form.Item>
        </div>
        {from && to && from.isSame(to, 'day') && (
          <Form.Item name="halfDay" valuePropName="checked" style={{ marginTop: -8 }}>
            <Checkbox>Half day</Checkbox>
          </Form.Item>
        )}
        <Form.Item name="reason" label="Reason" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        {taking !== null && (
          <Typography.Text type={taking === 0 || (balance?.left != null && balance.left < taking) ? 'danger' : 'secondary'}>
            {taking === 0 ? 'Those days are Sundays or holidays.' : `Takes ${days(taking)} (Sundays and holidays not counted).`}
            {balance && balance.left !== null ? ` ${days(balance.left)} of ${inSentence(LEAVE_TYPE_LABELS[balance.type])} left for ${year}.` : ''}
          </Typography.Text>
        )}
      </Form>
    </Modal>
  );
}
