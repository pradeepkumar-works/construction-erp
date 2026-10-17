'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Form, Input, Space, Typography } from 'antd';
import { formatPhone, MESSAGE_CHANNEL_LABELS, normalisePhone, type MessageChannel } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMessagingPrefs, useSendTestMessage, useUpdateMessagingPrefs } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { PHONE_INPUT } from '@/components/form/inputs';

type Values = { phone: string; whatsapp: boolean; sms: boolean };

/** The user's own opt-in for alerts on WhatsApp and by SMS: approval requests, send-backs, the daily reminders and digest. */
export function MessagingSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const { data, isLoading } = useMessagingPrefs(open);
  const update = useUpdateMessagingPrefs();
  const test = useSendTestMessage();
  const [form] = Form.useForm<Values>();
  const [lastTest, setLastTest] = useState<{ channel: MessageChannel; ok: boolean; text: string } | null>(null);
  const phone = Form.useWatch('phone', form);

  // Fill the form once per opening: saving the number before a test must not undo unsaved ticks.
  const filled = useRef(false);
  useEffect(() => {
    if (open && data && !filled.current) {
      form.setFieldsValue({ phone: data.phone ?? '', whatsapp: data.whatsapp, sms: data.sms });
      filled.current = true;
    }
    if (!open) {
      filled.current = false;
      setLastTest(null);
    }
  }, [open, data, form]);

  const save = async (v: Values) => {
    try {
      await update.mutateAsync({ phone: v.phone.trim() || null, whatsapp: v.whatsapp, sms: v.sms });
      await refresh();
      message.success(v.whatsapp || v.sms ? `Alerts on ${[v.whatsapp && 'WhatsApp', v.sms && 'SMS'].filter(Boolean).join(' and ')} saved` : 'WhatsApp and SMS alerts are off');
    } catch (e) {
      message.error(errorMessage(e));
      throw e;
    }
  };

  const sendTest = async (channel: MessageChannel) => {
    try {
      const typed = form.getFieldValue('phone')?.trim() || null;
      if (typed !== (data?.phone ?? null)) await update.mutateAsync({ phone: typed });
      const m = await test.mutateAsync(channel);
      setLastTest({ channel, ok: m.status === 'SENT', text: m.status === 'SENT' ? `Test sent on ${MESSAGE_CHANNEL_LABELS[channel]} to ${formatPhone(m.to)}.` : (m.error ?? 'Not sent') });
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const notReady = data && !data.whatsappReady && !data.smsReady;
  const valid = !!normalisePhone(phone);

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="WhatsApp and SMS alerts" okText="Save" onSubmit={save} okDisabled={isLoading} projectDefault={false}>
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          Get approval requests, send-backs on your submissions, the morning approvals digest and the DPR, test and payment reminders on your phone, as well as in the app. WhatsApp
          goes first; SMS is used when WhatsApp is off or does not get through.
        </Typography.Text>
        {notReady ? <Alert type="info" showIcon title="WhatsApp and SMS are not set up on this server yet" description="You can switch alerts on now; they start once your company's account is connected." /> : null}
        <Form<Values> form={form} layout="vertical" requiredMark={false} initialValues={{ phone: '', whatsapp: false, sms: false }}>
          <Form.Item
            name="phone"
            label="Mobile number"
            extra={valid ? `Messages go to ${formatPhone(normalisePhone(phone)!)}` : 'A 10-digit Indian mobile number, or + and the country code'}
            rules={[{ validator: (_, v: string) => (!v?.trim() || normalisePhone(v) ? Promise.resolve() : Promise.reject(new Error('Enter a mobile number, e.g. 98765 43210'))) }]}
          >
            <Input {...PHONE_INPUT} />
          </Form.Item>
          <Form.Item name="whatsapp" valuePropName="checked" style={{ marginBottom: 4 }}>
            <Checkbox>Send my alerts on WhatsApp</Checkbox>
          </Form.Item>
          <Form.Item name="sms" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox>Send my alerts by SMS</Checkbox>
          </Form.Item>
        </Form>
        <Space wrap>
          <Button size="small" disabled={!valid} loading={test.isPending && test.variables === 'WHATSAPP'} onClick={() => void sendTest('WHATSAPP')}>
            Send a test on WhatsApp
          </Button>
          <Button size="small" disabled={!valid} loading={test.isPending && test.variables === 'SMS'} onClick={() => void sendTest('SMS')}>
            Send a test SMS
          </Button>
        </Space>
        {lastTest ? <Alert type={lastTest.ok ? 'success' : 'warning'} showIcon title={lastTest.ok ? lastTest.text : `Test ${MESSAGE_CHANNEL_LABELS[lastTest.channel]} not sent: ${lastTest.text}`} /> : null}
      </Space>
    </FormShell>
  );
}
