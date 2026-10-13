'use client';

import React, { useEffect } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Modal, Skeleton, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { canSetLabourRates } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLabourRates } from '@/lib/queries';
import { formatINR } from '@/lib/format';

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
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title="Labour daily rates"
      onCancel={onClose}
      onOk={() => (editable ? form.submit() : onClose())}
      okText={editable ? 'Save' : 'Close'}
      cancelButtonProps={{ style: editable ? undefined : { display: 'none' } }}
      confirmLoading={save.isPending}
      width={560}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">Labour cost is each day&apos;s attendance head count × the daily rate of its trade.</Typography.Paragraph>
      {isLoading ? <Skeleton active /> : null}
      {data?.unpricedTrades.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Trades on attendance sheets without a rate"
          description={
            <span>
              {data.unpricedTrades.map((t) => (
                <Tag key={t} style={{ cursor: editable ? 'pointer' : undefined }} onClick={() => editable && form.setFieldValue('rates', [...(form.getFieldValue('rates') ?? []), { category: t }])}>
                  {t}
                </Tag>
              ))}
            </span>
          }
        />
      ) : null}
      {data && !editable ? (
        <div>
          {data.rates.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span>{r.category}</span>
              <span className="mono">{formatINR(r.dailyRate, true)} / day</span>
            </div>
          ))}
        </div>
      ) : null}
      {data && editable ? (
        <Form form={form} onFinish={(v) => save.mutate(v)}>
          <Form.List name="rates">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 180px 32px', gap: 8 }}>
                    <Form.Item name={[f.name, 'category']} rules={[{ required: true, whitespace: true, message: 'Trade' }]}>
                      <Input placeholder="Trade, e.g. Mason" maxLength={60} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'dailyRate']} rules={[{ required: true, message: 'Rate' }]}>
                      <InputNumber min={0} precision={2} prefix="₹" suffix="/ day" style={{ width: '100%' }} />
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
    </Modal>
  );
}
