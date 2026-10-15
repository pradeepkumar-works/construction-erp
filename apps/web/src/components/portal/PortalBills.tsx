'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Skeleton, Table, Typography } from 'antd';
import type { UseQueryResult } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { PortalBillDto, RaBillItemDto } from '@erp/shared';
import { isGuest } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useCertifyAsClient, usePortalBill } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { BillStageTag } from '@/components/bills/billUi';

/** RA bills sent to the client: the client's engineer or consultant checks the quantities and certifies them. */
export function PortalBills({ bills, openId, onOpen }: { bills: UseQueryResult<PortalBillDto[]>; openId: string | null; onOpen: (id: string | null) => void }) {
  const { data, isLoading, error, refetch } = bills;
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<PortalBillDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        onRow={(r) => ({ onClick: () => onOpen(r.id), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'No bills sent to you yet' }}
        scroll={{ x: 900 }}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'Bill', dataIndex: 'billLabel', width: 160 },
          { title: 'Bill date', dataIndex: 'billDate', width: 120, render: (v: string) => formatDate(v) },
          { title: 'Sent', dataIndex: 'sentDate', width: 120, render: (v: string | null) => formatDate(v) },
          { title: 'Work value', dataIndex: 'grossAmount', align: 'right', render: (v: string) => formatINR(v) },
          { title: 'Net payable', dataIndex: 'netPayable', align: 'right', render: (v: string) => formatINR(v) },
          { title: 'Stage', dataIndex: 'stage', width: 140, render: (s: PortalBillDto['stage']) => <BillStageTag stage={s} /> },
          { title: 'Certificate', key: 'cert', width: 200, render: (_, b) => (b.certifiedDate ? `${b.certificateNo ?? ''} ${formatDate(b.certifiedDate)}`.trim() : '-') },
        ]}
      />
      <PortalBillDrawer id={openId} onClose={() => onOpen(null)} />
    </>
  );
}

function PortalBillDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = usePortalBill(id);
  const [certifying, setCertifying] = useState(false);
  const canCertify = !!user && isGuest(user.roleKey) && data?.stage === 'SENT';
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      size={980}
      title={data ? `${data.billLabel}: ${data.projectName}` : 'RA bill'}
      extra={
        canCertify ? (
          <Button type="primary" onClick={() => setCertifying(true)}>
            Certify
          </Button>
        ) : null
      }
      destroyOnHidden
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data ? (
        <>
          {data.stage === 'SENT' && !canCertify ? <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Waiting for the client's certificate" /> : null}
          <Descriptions
            size="small"
            bordered
            column={2}
            style={{ marginBottom: 16 }}
            items={[
              { key: 'stage', label: 'Stage', children: <BillStageTag stage={data.stage} /> },
              { key: 'date', label: 'Bill date', children: `${formatDate(data.billDate)} (measured up to ${formatDate(data.measuredUpTo)})` },
              { key: 'sent', label: 'Sent', children: formatDate(data.sentDate) },
              { key: 'cert', label: 'Certificate', children: data.certifiedDate ? `${data.certificateNo ?? '-'}, ${formatDate(data.certifiedDate)}` : '-' },
              { key: 'gross', label: 'Work value this bill', children: formatINR(data.grossAmount) },
              ...(data.claimedGross && data.claimedGross !== data.grossAmount ? [{ key: 'claimed', label: 'Claimed', children: formatINR(data.claimedGross) }] : []),
              ...(data.pvLines.length ? [{ key: 'pv', label: 'Price variation', children: formatINR(data.pvAmount) }] : []),
              { key: 'gst', label: `GST ${data.gstRate}%`, children: formatINR(data.gstAmount) },
              { key: 'ded', label: 'Deductions', children: formatINR(data.totalDeductions) },
              { key: 'net', label: 'Net payable', children: <strong>{formatINR(data.netPayable)}</strong> },
              { key: 'upto', label: 'Work value up to date', children: formatINR(data.grossUpto) },
            ]}
          />
          <Typography.Title level={5}>Abstract of cost</Typography.Title>
          <BillItemsTable items={data.items} />
          {data.measurements?.length ? (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                Measurements
              </Typography.Title>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data.measurements}
                columns={[
                  { title: 'MB no.', dataIndex: 'mbNo', width: 140 },
                  { title: 'Date', dataIndex: 'date', width: 120, render: (v: string) => formatDate(v) },
                  { title: 'Item', dataIndex: 'boqItemNo', width: 80 },
                  { title: 'Location', dataIndex: 'location' },
                  { title: 'Quantity', dataIndex: 'totalQty', align: 'right', width: 120, render: (v: string) => formatQty(v) },
                ]}
              />
            </>
          ) : null}
          <CertifyModal bill={certifying ? data : null} onClose={() => setCertifying(false)} />
        </>
      ) : null}
    </Drawer>
  );
}

function BillItemsTable({ items }: { items: RaBillItemDto[] }) {
  return (
    <Table<RaBillItemDto>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={items}
      scroll={{ x: 900 }}
      columns={[
        { title: 'Item', dataIndex: 'itemNo', width: 70 },
        { title: 'Description', dataIndex: 'description', ellipsis: true },
        { title: 'Unit', dataIndex: 'unit', width: 70 },
        { title: 'Rate', dataIndex: 'rate', align: 'right', width: 110, render: (v: string) => formatINR(v, true) },
        { title: 'Previous', dataIndex: 'prevQty', align: 'right', width: 100, render: (v: string) => formatQty(v) },
        { title: 'This bill', dataIndex: 'thisQty', align: 'right', width: 100, render: (v: string) => formatQty(v) },
        { title: 'Certified', dataIndex: 'certifiedQty', align: 'right', width: 100, render: (v: string | null) => (v == null ? '-' : formatQty(v)) },
        { title: 'Amount', dataIndex: 'amount', align: 'right', width: 130, render: (v: string) => formatINR(v) },
      ]}
    />
  );
}

/** The certificate: date, number and the quantity passed for each item (as claimed unless cut). */
function CertifyModal({ bill, onClose }: { bill: PortalBillDto | null; onClose: () => void }) {
  const { message } = App.useApp();
  const certify = useCertifyAsClient();
  const [form] = Form.useForm<{ date: dayjs.Dayjs; certificateNo?: string; qty: Record<string, number | null> }>();
  const lines = (bill?.items ?? []).filter((i) => Number(i.thisQty) > 0);

  useEffect(() => {
    if (bill) form.setFieldsValue({ date: dayjs(), certificateNo: '', qty: Object.fromEntries(lines.map((l) => [l.boqItemId, Number(l.thisQty)])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill, form]);

  const submit = async (v: { date: dayjs.Dayjs; certificateNo?: string; qty: Record<string, number | null> }) => {
    if (!bill) return;
    const items = lines.filter((l) => v.qty[l.boqItemId] != null && v.qty[l.boqItemId] !== Number(l.thisQty)).map((l) => ({ boqItemId: l.boqItemId, certifiedQty: String(v.qty[l.boqItemId]) }));
    try {
      const out = await certify.mutateAsync({ id: bill.id, date: v.date.format('YYYY-MM-DD'), certificateNo: v.certificateNo?.trim() || null, items });
      message.success(`${out.billLabel} certified: work value ${formatINR(out.grossAmount)}`);
      onClose();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Modal open={!!bill} title={bill ? `Certify ${bill.billLabel}` : ''} onCancel={onClose} onOk={() => form.submit()} okText="Certify" confirmLoading={certify.isPending} width={760} destroyOnHidden>
      <Typography.Paragraph type="secondary">Enter the quantity you pass for each item. Items you leave as they are pass as claimed. The contractor's QS and project manager are told.</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="date" label="Certificate date" rules={[{ required: true }]} style={{ flex: 1 }}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item name="certificateNo" label="Certificate no." style={{ flex: 1 }}>
            <Input maxLength={100} placeholder="EE/RD/2026/114" />
          </Form.Item>
        </div>
        <Table
          rowKey="boqItemId"
          size="small"
          pagination={false}
          dataSource={lines}
          columns={[
            { title: 'Item', dataIndex: 'itemNo', width: 70 },
            { title: 'Description', dataIndex: 'description', ellipsis: true },
            { title: 'Claimed', key: 'c', align: 'right', width: 130, render: (_, l) => `${formatQty(l.thisQty)} ${l.unit}` },
            {
              title: 'Certified',
              key: 'q',
              width: 150,
              render: (_, l) => (
                <Form.Item name={['qty', l.boqItemId]} style={{ margin: 0 }} rules={[{ required: true, message: 'Required' }]}>
                  <InputNumber min={0} max={Number(l.thisQty)} style={{ width: '100%' }} aria-label={`Certified ${l.itemNo}`} />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
