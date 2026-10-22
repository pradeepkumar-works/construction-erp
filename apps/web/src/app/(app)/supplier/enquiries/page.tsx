'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Table, Tag } from 'antd';
import type { SupplierEnquiryDto } from '@erp/shared';
import { useSupplierEnquiries } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { QuoteForm } from '@/components/supplier/SupplierForms';

const stateOf = (e: SupplierEnquiryDto) => (e.respondedAt ? <Tag color="success">Quoted {formatDateTime(e.respondedAt)}</Tag> : e.open ? <Tag color="processing">Open</Tag> : <Tag>Closed</Tag>);

/** Enquiries sent to the supplier: quote on the open ones, once each. */
export default function SupplierEnquiriesPage() {
  const { data, isLoading, error, refetch } = useSupplierEnquiries();
  const search = useSearchParams();
  const [quoting, setQuoting] = useState<SupplierEnquiryDto | null>(null);
  // A notification's link opens the enquiry's quote form once; closing it leaves the list.
  const wanted = search.get('open');
  const [linkClosed, setLinkClosed] = useState<string | null>(null);
  const linked = wanted && wanted !== linkClosed ? (data?.find((x) => x.id === wanted && x.open) ?? null) : null;
  const shown = quoting ?? linked;
  return (
    <div className="page-container">
      <PageHeader title="Enquiries" subtitle="Requests for your rates. Quote on an open one once; the buyer sees it beside the others." />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? (
        <PageSkeleton header={false} />
      ) : (
        <Table<SupplierEnquiryDto>
          rowKey="id"
          size="small"
          dataSource={data ?? []}
          locale={{ emptyText: 'No enquiries sent to you yet' }}
          scroll={{ x: 820 }}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          columns={[
            { title: 'Request', dataIndex: 'requestNo', width: 140, render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Site', dataIndex: 'projectName', render: (v: string) => <span translate="no">{v}</span> },
            { title: 'Items', key: 'items', width: 80, align: 'right', render: (_, e) => e.lines.length },
            { title: 'Needed by', dataIndex: 'requiredDate', width: 120, render: (v: string) => formatDate(v) },
            { title: 'Quote by', dataIndex: 'closesOn', width: 120, render: (v: string) => formatDate(v) },
            { title: 'State', key: 'state', width: 190, render: (_, e) => stateOf(e) },
            {
              title: 'Action',
              key: 'action',
              width: 110,
              render: (_, e) =>
                e.open ? (
                  <Button type="primary" size="small" onClick={() => setQuoting(e)} aria-label={`Quote for ${e.requestNo}`}>
                    Quote
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      <QuoteForm
        enquiry={shown}
        onClose={() => {
          setQuoting(null);
          setLinkClosed(wanted);
        }}
      />
    </div>
  );
}
