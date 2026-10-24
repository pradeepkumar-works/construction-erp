'use client';

import React, { useEffect } from 'react';
import { Alert, App, Button, Form, Input, Modal, Skeleton, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { canSetLabourRates } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useLabourRates } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { themeColor } from '@/lib/theme';
import { FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

interface Row {
  category: string;
  dailyRate: number;
}

/** Daily wage per trade; attendance man-days × these rates are the labour cost. */
export function LabourRatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editable = !!user && canSetLabourRates(user.roleKey);
  const { data, isLoading } = useLabourRates(open);
  const [form] = Form.useForm<{ rates: Row[] }>();

  useEffect(() => {
    if (open && data) form.setFieldsValue({ rates: data.rates.map((r) => ({ category: r.category, dailyRate: Number(r.dailyRate) })) });
  }, [open, data, form]);

  const save = useMutation({
    mutationFn: async (v: { rates: Row[] }) => (await api.put('/cost/labour-rates', { rates: (v.rates ?? []).map((r) => ({ category: r.category.trim(), dailyRate: String(r.dailyRate) })) })).data,
    onSuccess: () => {
      message.success('Labour rates saved');
      qc.invalidateQueries({ queryKey: ['cost'] });
    },
    meta: FAIL_NOTICE,
  });

  const intro = (
    <>
      <Typography.Paragraph type="secondary">Labour cost is each day&apos;s attendance head count × the daily rate of its trade.</Typography.Paragraph>
      {isLoading ? <Skeleton active /> : null}
      {data?.unpricedTrades.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title="Trades on attendance sheets without a rate"
          description={
            <span>
              {data.unpricedTrades.map((t) => (
                editable ? (
                  <Button key={t} size="small" color="default" variant="filled" aria-label={`Add a rate for ${t}`} onClick={() => form.setFieldValue('rates', [...(form.getFieldValue('rates') ?? []), { category: t }])} style={{ marginInlineEnd: 8 }}>
                    {t}
                  </Button>
                ) : (
                  <AppTag key={t}>{t}</AppTag>
                )
              ))}
            </span>
          }
        />
      ) : null}
    </>
  );

  if (!editable)
    return (
      <Modal
        open={open}
        title="Labour daily rates"
        onCancel={onClose}
        footer={
          <Button type="primary" onClick={onClose}>
            Close
          </Button>
        }
        width={560}
        destroyOnHidden
      >
        {intro}
        {data ? (
          <div>
            {data.rates.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${themeColor('colorBorderSecondary')}` }}>
                <span>{r.category}</span>
                <span className="mono" translate="no">{formatINR(r.dailyRate, true)} / day</span>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    );

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={560} title="Labour daily rates" okText="Save" okDisabled={!data} onSubmit={(v) => save.mutateAsync(v)}>
      {intro}
      {data ? (
        <Form form={form}>
          <Form.List name="rates">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 32px', gap: 8 }}>
                    <Form.Item name={[f.name, 'category']} rules={[{ required: true, whitespace: true, message: 'Enter the trade' }]}>
                      <Input placeholder="Trade, e.g. Mason" maxLength={60} aria-label="Trade" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'dailyRate']} rules={[{ required: true, message: 'Enter the daily rate' }]}>
                      <MoneyInput suffix="/ day" aria-label="Daily rate" />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} aria-label="Remove" />
                  </div>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add()}>
                  Add trade
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      ) : null}
    </FormShell>
  );
}
