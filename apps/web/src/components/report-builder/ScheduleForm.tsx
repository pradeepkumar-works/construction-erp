'use client';

import React, { useEffect } from 'react';
import { App, Button, Form, Segmented, Select } from 'antd';
import { MAX_REPORT_RECIPIENTS, MAX_SCHEDULE_DAY, REPORT_FREQUENCIES, REPORT_FREQUENCY_LABELS, REPORT_WEEKDAYS, type ReportFrequency, type SavedReportDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useReportRecipients, useScheduleReport } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FormValues {
  frequency: ReportFrequency;
  weekday: number;
  dayOfMonth: number;
  recipientIds: string[];
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/**
 * Schedule (ARCHITECTURE "Reports you build"): weekly over the seven days before the day it goes, or monthly over the
 * month before; each person gets the report run as them, as a notice and an email with its table.
 */
export function ScheduleForm({ open, report, onClose }: { open: boolean; report: SavedReportDto; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const frequency = Form.useWatch('frequency', form);
  const { data: people, isLoading } = useReportRecipients(report.source, open);
  const schedule = useScheduleReport(report.id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const s = report.schedule;
    form.setFieldsValue(s ? { frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.dayOfMonth, recipientIds: s.recipients.map((r) => r.id) } : { frequency: 'WEEKLY', weekday: 0, dayOfMonth: 1, recipientIds: user ? [user.id] : [] });
  }, [open, report, user, form]);

  const submit = async (v: FormValues) => {
    await schedule.mutateAsync({ frequency: v.frequency, weekday: v.frequency === 'WEEKLY' ? v.weekday : undefined, dayOfMonth: v.frequency === 'MONTHLY' ? v.dayOfMonth : undefined, recipientIds: v.recipientIds });
    message.success('Schedule saved');
  };

  const stop = () =>
    modal.confirm({
      title: 'Stop sending this report?',
      content: 'Nobody gets it by email any more. The report itself stays.',
      okText: 'Stop sending',
      onOk: async () => {
        await schedule.mutateAsync({ stop: true });
        message.success('The report is no longer sent');
        onClose();
      },
    });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title="Schedule"
      okText="Save schedule"
      onSubmit={submit}
      projectDefault={false}
      footerExtra={report.schedule ? <Button onClick={stop}>Stop sending</Button> : undefined}
    >
      <Form form={form} name="report-schedule" layout="vertical">
        <Form.Item name="frequency" label="Send">
          <Segmented<ReportFrequency> options={REPORT_FREQUENCIES.map((f) => ({ value: f, label: REPORT_FREQUENCY_LABELS[f] }))} />
        </Form.Item>
        <FormGrid cols={2}>
          {frequency === 'MONTHLY' ? (
            <Form.Item name="dayOfMonth" label="On the" tooltip="Over the month before">
              <Select options={Array.from({ length: MAX_SCHEDULE_DAY }, (_, i) => ({ value: i + 1, label: `${ordinal(i + 1)} of the month` }))} />
            </Form.Item>
          ) : (
            <Form.Item name="weekday" label="Every" tooltip="Over the seven days before">
              <Select options={REPORT_WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
            </Form.Item>
          )}
        </FormGrid>
        <Form.Item
          name="recipientIds"
          label="To"
          rules={[{ required: true, type: 'array', min: 1, message: 'Choose who gets it' }, { type: 'array', max: MAX_REPORT_RECIPIENTS, message: `Up to ${MAX_REPORT_RECIPIENTS} people` }]}
          tooltip="Only people whose role opens it. Each one gets it with their own access."
        >
          <Select mode="multiple" loading={isLoading} showSearch={{ optionFilterProp: 'label' }} options={(people ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.role}` }))} placeholder="Choose people" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
