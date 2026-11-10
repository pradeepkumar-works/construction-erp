'use client';

import React, { useEffect } from 'react';
import { HelpLink } from '@/components/common/Help';
import { App, Form, Input, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CostHead, ProjectOpeningDto } from '@erp/shared';
import { COST_HEADS, COST_HEAD_LABELS, openingTotal } from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { toNumber } from '@/lib/format';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { Money } from '@/components/common/Money';

interface FormValues {
  asOf: dayjs.Dayjs;
  heads: Partial<Record<CostHead, number | null>>;
  workDone?: number | null;
  notes?: string;
}

/** Record what a project had spent, by head, and done on the day it came on Nirmaan. */
export function OpeningFormModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: ProjectOpeningDto }) {
  const { projectCode, startDate } = data;
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const heads = Form.useWatch('heads', form);
  const o = data.opening;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      asOf: dayjs(o?.asOf ?? data.enteredOn),
      heads: Object.fromEntries(COST_HEADS.map((h) => [h, o ? toNumber(o.heads[h]) : null])),
      workDone: o?.workDone ? toNumber(o.workDone) : null,
      notes: o?.notes ?? undefined,
    });
  }, [open, o, data.enteredOn, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        asOf: v.asOf.format('YYYY-MM-DD'),
        heads: Object.fromEntries(COST_HEADS.map((h) => [h, String(v.heads?.[h] ?? 0)])),
        workDone: v.workDone === null || v.workDone === undefined ? null : String(v.workDone),
        notes: v.notes?.trim() || null,
      };
      return (await api.put<ProjectOpeningDto>(`/cost/projects/${data.projectId}/opening`, body)).data;
    },
    onSuccess: () => {
      message.success('Opening cost saved');
      qc.invalidateQueries({ queryKey: ['cost'] });
      qc.invalidateQueries({ queryKey: ['management'] });
      qc.invalidateQueries({ queryKey: ['projects', data.projectId, 'setup'] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={720} title={`Opening cost: ${projectCode}`} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        <HelpLink>What the project had spent and done by the day it came on Nirmaan. Cost to date, margin, the budget forecast and the cash-flow forecast count it from that day, so
          enter what your accounts show up to then, before GST.</HelpLink>
        <FormGrid cols={2}>
          <Form.Item name="asOf" label="Figures as of" rules={[{ required: true, message: 'Choose the date the figures stand at' }]} extra="Usually the day the project came on Nirmaan">
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(d) => d.isAfter(dayjs(), 'day') || (!!startDate && d.isBefore(dayjs(startDate), 'day'))}
            />
          </Form.Item>
          <Form.Item name="workDone" label="Work done by then" extra="Value of the work done at contract rates; leave empty if not known">
            <MoneyInput />
          </Form.Item>
        </FormGrid>
        <FormSection title="Cost by head">
          <FormGrid cols={3}>
            {COST_HEADS.map((h) => (
              <Form.Item key={h} name={['heads', h]} label={COST_HEAD_LABELS[h]}>
                <MoneyInput />
              </Form.Item>
            ))}
          </FormGrid>
          <Typography.Paragraph strong style={{ textAlign: 'right', marginBottom: tk.space[4] }}>
            Total <Money value={openingTotal(heads ?? {})} />
          </Typography.Paragraph>
        </FormSection>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} maxLength={2000} placeholder="Where the figures come from: the books up to the date, the last cost report, and so on" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
