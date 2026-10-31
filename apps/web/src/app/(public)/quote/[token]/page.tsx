'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Descriptions, Flex, Form, Input, InputNumber, Result, Select, Skeleton, Typography, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { GST_RATES, type PublicEnquiryDto, type PublicQuoteInput } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { usePageTitle } from '@/lib/page-title';
import { FormGrid } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { BrandMark } from '@/components/shell/BrandMark';
import { ResultMark } from '@/components/common/ResultMark';
import { CheckCircleOutlined, DisconnectOutlined } from '@/components/common/icons';

interface FormValues {
  rates: Record<string, { rate?: number | null; gstRate?: number; remarks?: string }>;
  quoteRef?: string;
  validUntil?: dayjs.Dayjs | null;
  deliveryDays?: number | null;
  paymentTerms?: string;
  freight?: number | null;
  remarks?: string;
}

/**
 * The supplier's quote page (v5 item 95), opened from an enquiry email or WhatsApp link: no sign-in, the link is the
 * key. It shows the company's items and takes a rate and GST per item plus freight, delivery and terms, once.
 */
export default function QuotePage() {
  const { token } = useParams<{ token: string }>();
  const { token: t } = theme.useToken();
  const [form] = Form.useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const info = useQuery({
    queryKey: ['public-quote', token],
    queryFn: async () => (await api.get<PublicEnquiryDto>(`/public/quotes/${encodeURIComponent(token)}`)).data,
    enabled: !!token,
    retry: false,
  });
  const e = info.data;
  usePageTitle(e ? `Quote for ${e.organizationName}` : 'Send your quote');

  const submit = async (v: FormValues) => {
    if (!e) return;
    const lines = e.lines
      .filter((l) => v.rates?.[l.materialRequestItemId]?.rate !== null && v.rates?.[l.materialRequestItemId]?.rate !== undefined)
      .map((l) => ({ materialRequestItemId: l.materialRequestItemId, rate: String(v.rates[l.materialRequestItemId].rate), gstRate: String(v.rates[l.materialRequestItemId].gstRate ?? 0), remarks: v.rates[l.materialRequestItemId].remarks?.trim() || undefined }));
    if (!lines.length) {
      setError('Enter your rate for at least one item.');
      return;
    }
    const body: PublicQuoteInput = {
      lines,
      quoteRef: v.quoteRef?.trim() || undefined,
      validUntil: v.validUntil ? v.validUntil.format('YYYY-MM-DD') : undefined,
      deliveryDays: v.deliveryDays ?? undefined,
      paymentTerms: v.paymentTerms?.trim() || undefined,
      freight: v.freight ? String(v.freight) : undefined,
      remarks: v.remarks?.trim() || undefined,
    };
    setError(null);
    setSending(true);
    try {
      const { data } = await api.post<{ ok: true; respondedAt: string }>(`/public/quotes/${encodeURIComponent(token)}`, body);
      setSentAt(data.respondedAt);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const done = sentAt ?? e?.respondedAt ?? null;
  return (
    <div style={{ minHeight: '100vh', background: t.colorBgLayout, padding: `${t.paddingLG}px 16px` }}>
      <main style={{ maxWidth: 820, margin: '0 auto' }}>
        <Flex align="center" gap={t.marginXS} style={{ marginBottom: t.marginMD }}>
          <BrandMark size={28} />
          <Typography.Text type="secondary">Request for quotation</Typography.Text>
        </Flex>
        <h1 style={{ fontSize: t.fontSizeHeading3, margin: `0 0 ${t.marginXS}px` }}>{e ? <span translate="no">{e.organizationName}</span> : 'Send your quote'}</h1>
        {!token || info.error ? (
          <Result icon={<ResultMark icon={<DisconnectOutlined />} />} title="This link cannot be used" subTitle={errorMessage(info.error)} />
        ) : info.isLoading || !e ? (
          <Skeleton active />
        ) : done ? (
          <Result icon={<ResultMark icon={<CheckCircleOutlined />} />} title="Your quote was received" subTitle={`${e.organizationName} has your rates for ${e.requestNo} (sent ${formatDateTime(done)}). They will contact you about the order.`} />
        ) : (
          <>
            <Typography.Paragraph>
              Dear <span translate="no">{e.vendorName}</span>, please quote your rates for the items below by <strong>{formatDate(e.closesOn)}</strong>. Leave out any item you do not supply.
            </Typography.Paragraph>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} bordered style={{ marginBottom: t.marginMD }}>
              <Descriptions.Item label="Site"><span translate="no">{e.projectName}</span></Descriptions.Item>
              {e.siteAddress ? <Descriptions.Item label="Delivery at"><span translate="no">{e.siteAddress}</span></Descriptions.Item> : null}
              <Descriptions.Item label="Request">{e.requestNo}</Descriptions.Item>
              <Descriptions.Item label="Needed by">{formatDate(e.requiredDate)}</Descriptions.Item>
            </Descriptions>
            {e.message ? <Alert type="info" showIcon title={e.message} style={{ marginBottom: t.marginMD }} /> : null}
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ rates: Object.fromEntries(e.lines.map((l) => [l.materialRequestItemId, { gstRate: 18 }])) }}>
              <Flex vertical gap={t.marginSM} style={{ marginBottom: t.marginMD }}>
                {e.lines.map((l, i) => (
                  <Card key={l.materialRequestItemId} size="small" title={<span style={{ whiteSpace: 'normal' }}>{i + 1}. {l.itemName}</span>} extra={<span className="mono" translate="no">{formatQty(l.quantity)} {l.unit}</span>}>
                    {l.specification ? <Typography.Paragraph type="secondary">{l.specification}</Typography.Paragraph> : null}
                    <FormGrid cols={3}>
                      <Form.Item name={['rates', l.materialRequestItemId, 'rate']} label={`Rate per ${l.unit}, before GST`}>
                        <MoneyInput placeholder="Not supplied" />
                      </Form.Item>
                      <Form.Item name={['rates', l.materialRequestItemId, 'gstRate']} label="GST">
                        <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
                      </Form.Item>
                      <Form.Item name={['rates', l.materialRequestItemId, 'remarks']} label="Brand or note">
                        <Input maxLength={300} />
                      </Form.Item>
                    </FormGrid>
                  </Card>
                ))}
              </Flex>
              <Card size="small" title="Terms" style={{ marginBottom: t.marginMD }}>
                <FormGrid cols={3}>
                  <Form.Item name="freight" label="Freight to site">
                    <MoneyInput />
                  </Form.Item>
                  <Form.Item name="deliveryDays" label="Delivery in (days)">
                    <InputNumber min={0} max={365} precision={0} inputMode="numeric" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item name="paymentTerms" label="Payment terms">
                    <Input maxLength={200} placeholder="30 days from delivery" />
                  </Form.Item>
                  <Form.Item name="quoteRef" label="Your quotation no.">
                    <Input maxLength={60} />
                  </Form.Item>
                  <Form.Item name="validUntil" label="Rates valid until">
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
                  </Form.Item>
                </FormGrid>
                <Form.Item name="remarks" label="Remarks">
                  <Input.TextArea rows={2} maxLength={1000} />
                </Form.Item>
              </Card>
              {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: t.marginMD }} /> : null}
              <Button type="primary" htmlType="submit" size="large" loading={sending} block>
                Send quote
              </Button>
              <Typography.Paragraph type="secondary" style={{ marginTop: t.marginSM }}>
                You can send it once. The link closes on {formatDate(e.closesOn)}.
              </Typography.Paragraph>
            </Form>
          </>
        )}
      </main>
    </div>
  );
}
