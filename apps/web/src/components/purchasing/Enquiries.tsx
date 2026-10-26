'use client';

import React, { useEffect } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { CopyOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { ENQUIRY_DEFAULT_DAYS, ENQUIRY_VENDOR_STATE_LABELS, MAX_PAGE_SIZE, type EnquiryDto, type EnquiryVendorDto, type EnquiryVendorState, type MaterialRequestDto } from '@erp/shared';
import { useEnquiries, useSendEnquiry, useVendorsPage } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { FormShell } from '@/components/form/FormShell';

const STATE_COLOR: Record<EnquiryVendorState, string | undefined> = { QUOTED: 'green', OPENED: 'blue', SENT: undefined, NOT_SENT: 'orange', EXPIRED: undefined };

interface FormValues {
  vendorIds: string[];
  closesOn: dayjs.Dayjs;
  message?: string;
}

/**
 * Send an enquiry (v5 item 95): the request's items to chosen suppliers, each with a one-time link to type their rates.
 * Vendors with an email get it by email; for the others (or when email is not set up) the links show afterwards to
 * pass on by WhatsApp.
 */
export function EnquiryFormModal({ open, request, onClose, onSent }: { open: boolean; request: MaterialRequestDto; onClose: () => void; onSent: (e: EnquiryDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const vendors = useVendorsPage({ kind: 'SUPPLIER', pageSize: MAX_PAGE_SIZE, sortBy: 'name', sortOrder: 'asc' });
  const send = useSendEnquiry(request.id);
  const chosen = Form.useWatch('vendorIds', form) ?? [];
  const list = vendors.data?.items ?? [];
  const noEmail = list.filter((v) => chosen.includes(v.id) && !v.email);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ vendorIds: [], closesOn: dayjs().add(ENQUIRY_DEFAULT_DAYS, 'day') });
  }, [open, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      title={`Send enquiry for ${request.requestNo}`}
      okText="Send enquiry"
      onSubmit={async (v) => {
        const e = await send.mutateAsync({ vendorIds: v.vendorIds, closesOn: v.closesOn.format('YYYY-MM-DD'), message: v.message?.trim() || null });
        onSent(e);
        return e;
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          Each supplier gets a link to type rates, GST, freight and delivery days for the {request.items.length} item{request.items.length === 1 ? '' : 's'} on this request. No sign-in is needed; their answer lands on the comparative statement.
        </Typography.Paragraph>
        <Form.Item name="vendorIds" label="Suppliers" rules={[{ required: true, message: 'Choose at least one supplier' }]}>
          <Select
            mode="multiple"
            showSearch={{ optionFilterProp: 'label' }}
            loading={vendors.isLoading}
            placeholder="Type a supplier's name"
            options={list.map((v) => ({ value: v.id, label: v.email ? `${v.name} (${v.email})` : `${v.name} (no email)` }))}
          />
        </Form.Item>
        <Form.Item name="closesOn" label="Quotes by" rules={[{ required: true, message: 'Pick the last day to quote' }]} extra="The links stop working after this day.">
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="message" label="Note to suppliers">
          <Input.TextArea rows={2} maxLength={1000} placeholder="Delivery to site, unloading, brands accepted…" />
        </Form.Item>
        {noEmail.length ? (
          <Alert type="info" showIcon title={`${noEmail.map((v) => v.name).join(', ')} ${noEmail.length === 1 ? 'has' : 'have'} no email. You get the link to send on WhatsApp.`} />
        ) : null}
      </Form>
    </FormShell>
  );
}

/** After sending: who was emailed, and the links for the rest. */
export function EnquirySentModal({ enquiry, onClose }: { enquiry: EnquiryDto | null; onClose: () => void }) {
  const { message } = App.useApp();
  const copy = async (v: EnquiryVendorDto) => {
    if (!v.link) return;
    try {
      await navigator.clipboard.writeText(v.link);
      message.success(`Link for ${v.vendorName} copied`);
    } catch {
      message.error('Copy failed: select the link and copy it');
    }
  };
  const emailed = enquiry?.vendors.filter((v) => v.emailedAt) ?? [];
  const byHand = enquiry?.vendors.filter((v) => !v.emailedAt) ?? [];
  return (
    <Modal open={!!enquiry} title="Enquiry sent" onCancel={onClose} footer={<Button type="primary" onClick={onClose}>Done</Button>} destroyOnHidden>
      {enquiry ? (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {emailed.length ? <Alert type="success" showIcon title={`Emailed to ${emailed.map((v) => v.vendorName).join(', ')}.`} /> : null}
          {byHand.length ? (
            <>
              <Typography.Text>Send these links yourself (WhatsApp, SMS or email). Each works once, for that supplier only, until {formatDate(enquiry.closesOn)}.</Typography.Text>
              {byHand.map((v) => (
                <div key={v.vendorId}>
                  <Typography.Text strong translate="no">{v.vendorName}</Typography.Text>
                  {v.emailError ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>Not emailed: {v.emailError}</div> : null}
                  {v.link ? (
                    <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                      <Input readOnly value={v.link} aria-label={`Quote link for ${v.vendorName}`} onFocus={(e) => e.target.select()} />
                      <Button icon={<CopyOutlined />} onClick={() => copy(v)}>
                        Copy
                      </Button>
                    </Space.Compact>
                  ) : (
                    <Alert type="warning" showIcon title="The server does not know the web address, so it cannot make a link. Set WEB_URL on the API." />
                  )}
                </div>
              ))}
            </>
          ) : null}
        </Space>
      ) : null}
    </Modal>
  );
}

/** The enquiries sent for a request: each supplier's state (emailed, opened, quoted, closed). */
export function EnquiriesList({ requestId }: { requestId: string }) {
  const { data } = useEnquiries(requestId);
  if (!data?.length) return null;
  const rows = data.flatMap((e) => e.vendors.map((v) => ({ ...v, key: `${e.id}:${v.vendorId}`, closesOn: e.closesOn, sentAt: e.createdAt, sentBy: e.createdByName })));
  return (
    <Table
      size="small"
      rowKey="key"
      pagination={false}
      style={{ marginBottom: 12 }}
      dataSource={rows}
      scroll={{ x: 560 }}
      columns={[
        { title: 'Enquiry to', dataIndex: 'vendorName', render: (v, r) => <div translate="no">{v}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{r.email ?? 'No email'}</div></div> },
        { title: 'Sent', dataIndex: 'sentAt', width: 170, render: (v, r) => <div>{formatDateTime(v)}<div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>by {r.sentBy}</div></div> },
        { title: 'Closes', dataIndex: 'closesOn', width: 110, render: (v) => formatDate(v) },
        {
          title: 'State',
          key: 'state',
          width: 170,
          render: (_, r) => (
            <div>
              <AppTag color={STATE_COLOR[r.state]} style={{ margin: 0 }}>
                {ENQUIRY_VENDOR_STATE_LABELS[r.state]}
              </AppTag>
              {r.respondedAt ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{formatDateTime(r.respondedAt)}</div> : null}
            </div>
          ),
        },
      ]}
    />
  );
}
