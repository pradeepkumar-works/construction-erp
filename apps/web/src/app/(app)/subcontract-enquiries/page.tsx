'use client';

import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Row, Select, Statistic, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { PlusOutlined } from '@/components/common/icons';
import { canRunSubcontractEnquiries, type ScEnquiryDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useScEnquiries } from '@/lib/queries';
import { useListPage } from '@/lib/listPage';
import { useNewIntent } from '@/lib/new-intent';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { ScEnquiryForm, ScEnquiryStatusTag } from '@/components/sc-enquiries/ScEnquiryForms';

const KEYS = ['status'] as const;
const STATUS_OPTIONS = [
  { value: 'open', label: 'Open enquiries' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All enquiries' },
];
const today = () => new Date().toLocaleDateString('en-CA');

/**
 * Subcontract enquiries (v6 item 111): work sent to several subcontractors to quote, the quotes compared and the chosen
 * one made a work order. Open ones first, soonest closing; run by those who issue work orders.
 */
function ScEnquiriesPage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const router = useRouter();
  const canRun = !!user && canRunSubcontractEnquiries(user.roleKey);
  const [adding, setAdding] = useState(false);
  useNewIntent('subcontract-enquiry', canRun, () => setAdding(true));
  const [projectId] = useProjectScope();
  const page = useListPage<'closesOn'>({ keys: KEYS, sortBy: 'closesOn', sortOrder: 'asc', scope: projectId });
  const status = (page.filters.status as string | undefined) ?? 'open';
  const { data, isLoading, isFetching, error, refetch } = useScEnquiries({ status, projectId, q: page.params.q }, canRun);
  const open = (id: string) => router.push(`/subcontract-enquiries/${id}`);
  const sub = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
      {text}
    </Typography.Text>
  );

  const columns: ListColumn<ScEnquiryDto>[] = [
    {
      key: 'work',
      title: 'Work',
      locked: true,
      width: 280,
      render: (_, r) => (
        <div>
          <RecordLink href={`/subcontract-enquiries/${r.id}`} onOpen={() => open(r.id)} strong>
            {r.title}
          </RecordLink>
          {sub(<span translate="no">{`${r.enquiryNo} · ${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`}</span>)}
        </div>
      ),
    },
    {
      key: 'project',
      title: 'Project',
      width: 170,
      render: (_, r) => (
        <div translate="no">
          {r.projectCode}
          {sub(r.projectName)}
        </div>
      ),
    },
    {
      key: 'closesOn',
      title: 'Closes',
      width: 120,
      render: (_, r) =>
        r.closesOn ? (
          <div>
            <span translate="no">{formatDate(r.closesOn)}</span>
            {r.status === 'OPEN' && r.closesOn < today() ? <div><AppTag tone="pending">Closed</AppTag></div> : null}
          </div>
        ) : (
          '-'
        ),
    },
    { key: 'status', title: 'Status', width: 100, render: (_, r) => <ScEnquiryStatusTag status={r.status} /> },
    {
      key: 'quotes',
      title: 'Quotes',
      width: 110,
      render: (_, r) => (
        <div>
          {`${r.received} of ${r.invited} in`}
          {r.status === 'OPEN' && r.invited > r.received ? sub(`${r.invited - r.received} awaited`) : null}
        </div>
      ),
    },
    {
      key: 'lowest',
      title: 'Lowest quote',
      width: 170,
      align: 'right',
      render: (_, r) =>
        r.status === 'AWARDED' && r.awardedTotal ? (
          <div translate="no">
            {formatINR(r.awardedTotal)}
            {sub(`Awarded to ${r.awardedVendorName ?? ''}`)}
          </div>
        ) : r.lowestTotal ? (
          <div translate="no">
            {formatINR(r.lowestTotal)}
            {sub(r.lowestVendorName)}
          </div>
        ) : (
          '-'
        ),
    },
    {
      key: 'wo',
      title: 'Work order',
      width: 130,
      defaultFrom: 1280,
      render: (_, r) =>
        r.workOrderId && r.woNo ? (
          <RecordLink href={`/work-orders/${r.workOrderId}`} onOpen={() => router.push(`/work-orders/${r.workOrderId}`)}>
            <span translate="no">{r.woNo}</span>
          </RecordLink>
        ) : (
          '-'
        ),
    },
  ];
  const choice = useColumnChoice('subcontract-enquiries', columns);
  const rows = data?.items ?? [];
  const s = data?.summary;

  const newButton = canRun ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New enquiry
    </Button>
  ) : null;
  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode) => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4 } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );

  return (
    <div className="page-container">
      <PageHeader title="Subcontract enquiries" subtitle="Work sent to subcontractors to quote, their rates compared item by item, and the chosen quote made a work order." extra={newButton} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="list" /> : null}
      {s ? (
        <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
          {stat('Open', s.open, 'Enquiries out to quote')}
          {stat('Awaiting quotes', s.awaitingQuotes, 'Open, with a quote not yet in')}
          {stat('Ready to award', s.readyToAward, 'Open, with a complete quote in')}
          {stat('Awarded this year', s.awardedThisYear, <span translate="no">{`${formatINR(s.awardedValue)} since 1 April`}</span>)}
        </Row>
      ) : null}
      <Card size="small">
        <ListToolbar
          projectId={projectId}
          onProject={() => undefined}
          hideProject
          search={page.search}
          onSearch={page.setSearch}
          searchPlaceholder="Search work, number or subcontractor"
          searchLabel="Search subcontract enquiries"
        >
          <Select aria-label="Enquiries to show" style={{ width: 180 }} value={status} onChange={(v) => page.setFilter('status', v === 'open' ? undefined : v)} options={STATUS_OPTIONS} />
        </ListToolbar>
        <DataTable<ScEnquiryDto>
          columns={columns}
          visible={choice.visible}
          onChooseColumns={choice.setChosen}
          chosenIsDefault={choice.isDefault}
          rows={rows}
          loading={isLoading || isFetching}
          table={{ pagination: false }}
          onOpen={open}
          empty={{ filtered: !!page.params.q || status !== 'open', clear: () => page.clear() }}
          failed={!!error}
          scrollX={1080}
          emptyText={<EmptyArt art="entries" title={page.params.q ? 'No enquiry matches the search' : status === 'open' ? 'No open enquiry' : 'No enquiry here yet'} />}
          emptyAction={newButton}
        />
      </Card>
      <ScEnquiryForm open={adding} onClose={() => setAdding(false)} onSaved={open} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScEnquiriesPage />
    </Suspense>
  );
}
