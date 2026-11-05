'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Select, TimePicker, Typography } from 'antd';
import dayjs from 'dayjs';
import type { AttendanceCorrectionDto, StaffAttendanceStatus } from '@erp/shared';
import { STAFF_ATTENDANCE_LABELS, STAFF_ATTENDANCE_STATUSES } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useStaffAttendance } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { clock } from './staffUi';

interface FormValues {
  date: dayjs.Dayjs;
  dayStatus: StaffAttendanceStatus;
  checkIn?: dayjs.Dayjs | null;
  checkOut?: dayjs.Dayjs | null;
  overtimeHours?: number | null;
  reason: string;
}

/**
 * Ask to correct one day of your own attendance (a missed mark-in, a wrong status, overtime the register missed). It
 * waits on your manager, then HR; HR's approval writes the day. A time or overtime left empty keeps the day as it is.
 */
export function CorrectionFormModal({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId: string }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const date = Form.useWatch('date', form);
  const status = Form.useWatch('dayStatus', form);
  const day = date ? date.format('YYYY-MM-DD') : '';
  const { data: marked } = useStaffAttendance(open && day ? employeeId : undefined, day, day);
  const now = marked?.[0];

  useEffect(() => {
    if (open) form.setFieldsValue({ dayStatus: 'PRESENT' });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) =>
      (
        await api.post<AttendanceCorrectionDto>('/staff/corrections', {
          date: v.date.format('YYYY-MM-DD'),
          dayStatus: v.dayStatus,
          checkIn: v.checkIn ? v.checkIn.format('HH:mm') : null,
          checkOut: v.checkOut ? v.checkOut.format('HH:mm') : null,
          overtimeHours: v.overtimeHours ?? null,
          reason: v.reason.trim(),
        })
      ).data,
    onSuccess: (c) => {
      message.success(`Correction for ${formatDate(c.date)} sent to ${c.approval.waitingOn ?? 'HR'}`);
      qc.invalidateQueries({ queryKey: ['staff'] });
    },
    meta: FAIL_NOTICE,
  });

  const absent = status === 'ABSENT';
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="Ask to correct attendance" okText="Ask" onSubmit={(v) => mutation.mutateAsync(v)} width={560}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="date" label="Day" rules={[{ required: true, message: 'Choose the day to correct' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="dayStatus" label="Should be" rules={[{ required: true, message: 'Choose how the day should read' }]}>
            <Select options={STAFF_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: STAFF_ATTENDANCE_LABELS[s] }))} />
          </Form.Item>
        </FormGrid>
        {date && (
          <Typography.Paragraph type="secondary">
            {now ? `Marked now: ${STAFF_ATTENDANCE_LABELS[now.status]}, in ${clock(now.checkIn)}, out ${clock(now.checkOut)}${now.overtimeHours ? `, ${now.overtimeHours} h overtime` : ''}.` : 'Nothing is marked for this day.'}
          </Typography.Paragraph>
        )}
        {!absent && (
          <FormGrid cols={3}>
            <Form.Item name="checkIn" label="Mark-in">
              <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="checkOut"
              label="Mark-out"
              dependencies={['checkIn']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v: dayjs.Dayjs | null) => {
                    const start = getFieldValue('checkIn') as dayjs.Dayjs | null;
                    return !v || !start || v.isAfter(start) ? Promise.resolve() : Promise.reject(new Error('Choose a time after mark-in'));
                  },
                }),
              ]}
            >
              <TimePicker format="HH:mm" minuteStep={5} needConfirm={false} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="overtimeHours" label="Overtime" extra="Half hours; 0 clears it">
              <QuantityInput unit="hours" step={0.5} precision={1} max={15} />
            </Form.Item>
          </FormGrid>
        )}
        <Form.Item name="reason" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the day needs correcting' }]}>
          <Input.TextArea rows={2} maxLength={500} placeholder="The phone was off at the gate; I was on site from 9" />
        </Form.Item>
        <Typography.Text type="secondary">It goes to your manager first, then HR. Once HR approves it, the day changes.</Typography.Text>
      </Form>
    </FormShell>
  );
}
