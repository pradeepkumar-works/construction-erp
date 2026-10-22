'use client';

import React, { useState } from 'react';
import { App, Button, Flex, Table, Typography } from 'antd';
import type { SupplierInvoiceDto } from '@erp/shared';
import { useSupplierAction, useSupplierInvoices } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { PhotoThumbs } from '@/components/common/AttachmentGallery';
import { InvoiceForm } from '@/components/supplier/SupplierForms';
import { InvoiceStageTag, Money } from '@/components/supplier/supplierUi';

/** The supplier's invoices: send one with its file, follow it to a bill and payment, fix and resend a returned one. */
export default function SupplierInvoicesPage() {
  const { message, modal } = App.useApp();
  const { data, isLoading, error, refetch } = useSupplierInvoices();
  const act = useSupplierAction();
  const [form, setForm] = useState<{ again: SupplierInvoiceDto | null } | null>(null);
  const withdraw = (i: SupplierInvoiceDto) =>
    modal.confirm({
      title: `Withdraw invoice ${i.invoiceNo}?`,
      content: 'Accounts stop working on it. You can send it again with the same number.',
      okText: 'Withdraw',
      cancelText: 'Keep it',
      onOk: async () => {
        try {
          await act.mutateAsync({ path: `/supplier/invoices/${i.id}/withdraw` });
          message.success(`${i.invoiceNo} withdrawn`);
        } catch (e) {
          message.error(errorMessage(e));
        }
      },
    });
  const send = (
    <Button type="primary" onClick={() => setForm({ again: null })}>
      Send an invoice
    </Button>
  );
  return (
    <div className="page-container">
      <PageHeader title="Invoices" subtitle="Invoices you sent to accounts, and the bill and payment each became." extra={send} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <PageSkeleton header={false} />
      ) : (
        <Table<SupplierInvoiceDto>
          rowKey="id"
          size="small"
          dataSource={data ?? []}
          locale={{ emptyText: 'No invoices sent yet. Send your first one with Send an invoice.' }}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          columns={[
            { title: 'Invoice', dataIndex: 'invoiceNo', width: 150, render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Date', dataIndex: 'invoiceDate', width: 110, render: (v: string) => formatDate(v) },
            { title: 'Against', key: 'against', width: 140, render: (_, i) => <span translate="no">{i.poNo ?? i.woNo ?? '-'}</span> },
            { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v: string) => <Money value={v} /> },
            {
              title: 'Where it is',
              key: 'stage',
              render: (_, i) => (
                <Flex vertical gap={2}>
                  <span>
                    <InvoiceStageTag stage={i.stage} />
                    {i.bill ? <span translate="no">{i.bill.billNo}</span> : null}
                  </span>
                  {i.stage === 'RETURNED' && i.returnNote ? <Typography.Text type="secondary">{i.returnNote}</Typography.Text> : null}
                  {i.bill && i.stage !== 'PAID' && Number(i.bill.paid) > 0 ? (
                    <Typography.Text type="secondary">
                      Paid <Money value={i.bill.paid} /> of <Money value={i.bill.payable} />
                    </Typography.Text>
                  ) : null}
                </Flex>
              ),
            },
            { title: 'File', key: 'file', width: 110, render: (_, i) => <PhotoThumbs attachments={i.attachments} /> },
            {
              title: 'Action',
              key: 'action',
              width: 130,
              render: (_, i) =>
                i.stage === 'RETURNED' || i.stage === 'WITHDRAWN' ? (
                  <Button size="small" onClick={() => setForm({ again: i })} aria-label={`Send ${i.invoiceNo} again`}>
                    Send again
                  </Button>
                ) : i.stage === 'SUBMITTED' ? (
                  <Button size="small" onClick={() => withdraw(i)} aria-label={`Withdraw ${i.invoiceNo}`}>
                    Withdraw
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      <InvoiceForm open={!!form} again={form?.again} onClose={() => setForm(null)} />
    </div>
  );
}
