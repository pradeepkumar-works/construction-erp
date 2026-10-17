'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Descriptions, Form, Input, Radio, Row, Select, Table, Tag, Typography } from 'antd';
import { CreditCardOutlined, PrinterOutlined } from '@ant-design/icons';
import type { BillingDetailsDto, BillingInvoiceDto, BillingStatus } from '@erp/shared';
import { BILLING_STATUS_LABELS, BILLING_UNIT_LABELS, BILLING_YEAR_CHARGED_MONTHS, GST_STATES, PRODUCT_NAME, canManageBilling } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { payWithRazorpay } from '@/lib/razorpay';
import { useBilling, useBillingInvoices, useCreateBillingOrder, useUpdateBillingDetails, useVerifyBillingPayment } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { openInvoicePrint } from '@/components/billing/invoicePrint';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

const STATUS_COLORS: Record<BillingStatus, string> = { TRIAL: 'blue', ACTIVE: 'green', READ_ONLY: 'red', EXEMPT: 'default' };
const STATE_OPTIONS = Object.entries(GST_STATES).map(([code, name]) => ({ value: code, label: `${name} (${code})` }));

export default function BillingPage() {
  const { user, refresh } = useAuth();
  const { message } = App.useApp();
  const admin = !!user && canManageBilling(user.roleKey) && !!user.billing;
  const { data, isLoading, error, refetch } = useBilling(admin);
  const invoices = useBillingInvoices(admin);
  const order = useCreateBillingOrder();
  const verify = useVerifyBillingPayment();
  const [months, setMonths] = useState<1 | 12>(1);
  const [paying, setPaying] = useState(false);

  if (!user) return null;
  if (!user.billing)
    return (
      <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
        <PageHeader title="Billing" />
        <Alert type="info" title={`Billing is not switched on for this ${PRODUCT_NAME} server.`} />
      </div>
    );
  if (!admin)
    return (
      <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
        <PageHeader title="Billing" />
        <Alert type="info" title="Only an admin can see and pay for the subscription." />
      </div>
    );

  const pay = async () => {
    setPaying(true);
    try {
      const o = await order.mutateAsync(months);
      const paid = await payWithRazorpay(o);
      if (!paid) return;
      const s = await verify.mutateAsync(paid);
      message.success(`Payment received. Paid until ${formatDate(s.paidUntil)}`);
      await refresh();
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  const amount = data ? (months === 12 ? data.yearly : data.monthly) : null;
  const unit = data ? BILLING_UNIT_LABELS[data.unit] : null;

  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader title="Billing" subtitle={`Your ${PRODUCT_NAME} subscription and GST invoices`} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading || !data || !amount || !unit ? (
        error ? null : <PageSkeleton shape="record" header={false} />
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2 }}
              items={[
                { key: 'status', label: 'Status', children: <Tag color={STATUS_COLORS[data.status]}>{BILLING_STATUS_LABELS[data.status]}</Tag> },
                ...(data.paidUntil ? [{ key: 'paid', label: 'Paid until', children: formatDate(data.paidUntil) }] : []),
                ...(data.trialEndsAt ? [{ key: 'trial', label: 'Free trial ends', children: formatDate(data.trialEndsAt) }] : []),
                { key: 'price', label: 'Price', children: `${formatINR(data.unitPrice)} per ${unit.one} per month, plus GST` },
              ]}
            />
            {data.status === 'READ_ONLY' && (
              <Alert
                style={{ marginTop: 12 }}
                type="error"
                showIcon
                title="The company is read-only"
                description="Everyone can still see and export everything, but nothing new can be entered until the subscription is paid. Nothing has been deleted."
              />
            )}
          </Card>
          {data.status !== 'EXEMPT' && (
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card title={data.status === 'ACTIVE' ? 'Renew' : 'Subscribe'} style={{ marginBottom: 16 }}>
                  <Typography.Paragraph>
                    {data.units} {data.units === 1 ? unit.one : unit.many} at {formatINR(data.unitPrice)} a month.{' '}
                    {data.status === 'TRIAL' && data.trialEndsAt ? `Paying now starts after the trial, on the day after ${formatDate(data.trialEndsAt)}.` : ''}
                  </Typography.Paragraph>
                  <Radio.Group value={months} onChange={(e) => setMonths(e.target.value)} style={{ marginBottom: 12 }}>
                    <Radio.Button value={1}>Monthly</Radio.Button>
                    <Radio.Button value={12}>Yearly ({12 - BILLING_YEAR_CHARGED_MONTHS} months free)</Radio.Button>
                  </Radio.Group>
                  <Descriptions
                    size="small"
                    column={1}
                    bordered
                    items={[
                      { key: 't', label: 'Amount', children: formatINR(amount.taxable, true) },
                      ...(Number(amount.igst) > 0
                        ? [{ key: 'i', label: 'IGST 18%', children: formatINR(amount.igst, true) }]
                        : [{ key: 'c', label: 'CGST 9% + SGST 9%', children: formatINR(Number(amount.cgst) + Number(amount.sgst), true) }]),
                      { key: 'total', label: 'Total', children: <b>{formatINR(amount.total, true)}</b> },
                    ]}
                  />
                  {!data.detailsComplete && <Alert style={{ marginTop: 12 }} type="warning" showIcon title="Fill in who the invoice is made out to before paying." />}
                  <Button type="primary" icon={<CreditCardOutlined />} style={{ marginTop: 12 }} disabled={!data.detailsComplete} loading={paying} onClick={pay}>
                    Pay {formatINR(amount.total, true)}
                  </Button>
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    UPI, cards and net banking through Razorpay. The GST invoice appears below once paid.
                  </Typography.Paragraph>
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <DetailsCard details={data.details} />
              </Col>
            </Row>
          )}
          <Card title="Invoices" style={{ marginBottom: 16 }}>
            <Table<BillingInvoiceDto>
              rowKey="id"
              size="small"
              loading={invoices.isLoading}
              dataSource={invoices.data ?? []}
              locale={{ emptyText: 'No payments yet' }}
              pagination={{ pageSize: 12, hideOnSinglePage: true }}
              scroll={{ x: 640 }}
              columns={[
                { title: 'Invoice', dataIndex: 'invoiceNo', width: 150 },
                { title: 'Date', dataIndex: 'invoiceDate', width: 120, render: (v: string) => formatDate(v) },
                { title: 'Period', key: 'p', render: (_, r) => `${formatDate(r.periodFrom)} to ${formatDate(r.periodTo)}` },
                { title: 'Total', dataIndex: 'total', width: 130, align: 'right', render: (v: string) => formatINR(v, true) },
                {
                  title: '',
                  key: 'print',
                  width: 90,
                  render: (_, r) => (
                    <Button size="small" icon={<PrinterOutlined />} onClick={() => openInvoicePrint(r) || message.warning('Allow pop-ups to print the invoice')}>
                      Print
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/** Who the GST invoices are made out to; the GSTIN's first two digits decide the place of supply. */
function DetailsCard({ details }: { details: BillingDetailsDto }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<BillingDetailsDto>();
  const save = useUpdateBillingDetails();
  useEffect(() => form.setFieldsValue(details), [details, form]);

  const submit = async (v: BillingDetailsDto) => {
    try {
      await save.mutateAsync({ name: v.name, gstin: v.gstin?.trim() || null, address: v.address, stateCode: v.stateCode ?? null });
      message.success('Invoice details saved');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Card title="Invoice to" style={{ marginBottom: 16 }}>
      <Form form={form} layout="vertical" onFinish={submit} initialValues={details} requiredMark={false}>
        <Form.Item name="name" label="Legal name" rules={[{ required: true, message: 'Enter the legal name' }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="gstin" label="GSTIN (if registered)">
          <Input maxLength={15} placeholder="21AAAGO1234F1Z5" style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item name="address" label="Billing address" rules={[{ required: true, message: 'Enter the billing address' }]}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Form.Item name="stateCode" label="State (place of supply)" extra="Taken from the GSTIN when one is given.">
          <Select showSearch={{ optionFilterProp: 'label' }} options={STATE_OPTIONS} allowClear />
        </Form.Item>
        <Button htmlType="submit" loading={save.isPending}>
          Save details
        </Button>
      </Form>
    </Card>
  );
}
