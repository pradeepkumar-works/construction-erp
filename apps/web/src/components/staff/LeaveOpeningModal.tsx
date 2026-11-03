'use client';

import React from 'react';
import { App, Form, InputNumber, Typography } from 'antd';
import type { EmployeeDto, LeaveOpeningDto } from '@erp/shared';
import { LEAVE_TYPE_LABELS, OPENING_LEAVE_TYPES } from '@erp/shared';
import { useSaveLeaveOpening } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { formatDateTime } from '@/lib/format';

type Values = Record<string, number | null>;

const daysInput = (max: number, placeholder?: string) => <InputNumber min={0} max={max} step={0.5} suffix="days" placeholder={placeholder} style={{ width: '100%' }} />;

/**
 * An employee's leave before Nirmaan for one year: the days of each kind taken that year in the old records, and the
 * earned leave they brought forward. The balances count it at once.
 */
export function LeaveOpeningModal({ open, onClose, employee, year, opening }: { open: boolean; onClose: () => void; employee: EmployeeDto; year: number; opening: LeaveOpeningDto }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSaveLeaveOpening(employee.id);
  const initial: Values = Object.fromEntries(opening.lines.flatMap((l) => [[`taken_${l.type}`, l.takenBefore], ...(l.type === 'EARNED' ? [['brought', l.broughtForward]] : [])]));
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      projectDefault={false}
      title={`Opening leave for ${employee.fullName}, ${year}`}
      okText="Save opening leave"
      onSubmit={async (v) => {
        await save.mutateAsync({
          year,
          lines: OPENING_LEAVE_TYPES.map((type) => ({ type, takenBefore: Number(v[`taken_${type}`] ?? 0), broughtForward: type === 'EARNED' && v.brought !== null && v.brought !== undefined ? Number(v.brought) : null })),
        });
        message.success(`Opening leave for ${employee.fullName} saved. The balances count it now.`);
      }}
    >
      <Typography.Paragraph type="secondary">
        For someone whose leave was kept elsewhere before Nirmaan: the days they took in {year} before then count as taken, and earned leave brought forward
        stands in for what Nirmaan carries from {year - 1}.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={initial}>
        <FormGrid cols={3}>
          {OPENING_LEAVE_TYPES.map((type) => (
            <Form.Item key={type} name={`taken_${type}`} label={`${LEAVE_TYPE_LABELS[type]} taken`}>
              {daysInput(366)}
            </Form.Item>
          ))}
        </FormGrid>
        <Form.Item name="brought" label={`Earned leave brought forward into ${year}`} extra="Leave it empty for Nirmaan to carry what the year before left, by your leave rules">
          {daysInput(300, 'Worked out')}
        </Form.Item>
      </Form>
      {opening.updatedByName && (
        <Typography.Text type="secondary">
          Last set by {opening.updatedByName}, {formatDateTime(opening.updatedAt)}
        </Typography.Text>
      )}
    </FormShell>
  );
}
