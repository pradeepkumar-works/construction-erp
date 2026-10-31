'use client';

import React from 'react';
import { Alert, Card, Col, Row, Statistic, Typography, theme } from 'antd';
import { useSupplierHome } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { LinkButton } from '@/components/common/LinkButton';

/** The supplier portal's home (v6 item 105): what waits on the supplier, and what is due to them. */
export default function SupplierHomePage() {
  const { token } = theme.useToken();
  const { data, isLoading, error, refetch } = useSupplierHome();
  const tile = (title: string, value: React.ReactNode, href: string, action: string, note?: React.ReactNode) => (
    <Col xs={24} sm={12} xl={8}>
      <Card style={{ height: '100%' }}>
        <Statistic title={title} value={typeof value === 'number' ? value : 0} formatter={typeof value === 'number' ? undefined : () => value} styles={{ content: { fontSize: token.fontSizeHeading3 } }} />
        {note ? <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXS}px 0 0` }}>{note}</Typography.Paragraph> : null}
        <LinkButton href={href} style={{ marginTop: token.marginSM }}>
          {action}
        </LinkButton>
      </Card>
    </Col>
  );
  return (
    <div className="page-container">
      <PageHeader
        title="Home"
        subtitle={data ? <span translate="no">{`${data.vendor.name} with ${data.organizationName}`}</span> : 'Your orders, invoices and payments'}
      />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <PageSkeleton header={false} shape="home" /> : null}
      {data ? (
        <>
          {data.invoicesReturned ? (
            <Alert
              type="warning"
              showIcon
              title={`${data.invoicesReturned} invoice${data.invoicesReturned === 1 ? ' was' : 's were'} returned by accounts. Fix and send again.`}
              action={<LinkButton href="/supplier/invoices">Open invoices</LinkButton>}
              style={{ marginBottom: token.marginMD }}
            />
          ) : null}
          <Row gutter={[16, 16]}>
            {tile('Enquiries to quote', data.enquiriesOpen, '/supplier/enquiries', 'Open enquiries')}
            {tile('Orders to accept', data.ordersToAccept, '/supplier/orders', 'Open orders', `${data.ordersOpen} purchase order${data.ordersOpen === 1 ? '' : 's'} with material still to send`)}
            {tile('Invoices with accounts', data.invoicesWithAccounts, '/supplier/invoices', 'Send an invoice')}
            {tile(
              'Due to you',
              <span translate="no">{formatINR(data.due)}</span>,
              '/supplier/statement',
              'Open payments',
              Number(data.overdue) > 0 ? <span translate="no">{`${formatINR(data.overdue)} past its due date`}</span> : 'Nothing past its due date',
            )}
            {tile(
              'Last payment',
              data.lastPayment ? <span translate="no">{formatINR(data.lastPayment.amount)}</span> : 'None yet',
              '/supplier/statement',
              'Open your statement',
              data.lastPayment ? `On ${formatDate(data.lastPayment.date)}` : null,
            )}
            {tile('Details changes waiting', data.changesPending, '/supplier/profile', 'Open your profile', data.vendor.gstin ? <span translate="no">{`GSTIN ${data.vendor.gstin}`}</span> : null)}
          </Row>
        </>
      ) : null}
    </div>
  );
}
