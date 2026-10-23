'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { App, Button, Card, Empty, Flex, Result, Statistic, Tag, Typography, theme } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { canViewContract, canViewLetters, type BillingReadinessRowDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useBillingReadiness, usePaymentReminder } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { requestNew } from '@/lib/new-intent';
import { errorMessage } from '@/lib/api';
import { DRAFT_PAGES } from '@/components/ai/drafts';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

/**
 * Billing readiness (AI item 122): per project, money earned and not yet asked for (approved measurements in no RA bill,
 * approved bills not sent) and money asked for and not paid, late once past the days the client takes. Draft reminder
 * opens a letter filled in from the bill and the contract's payment clause, for the project manager to check and send.
 */
export default function Page() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const router = useRouter();
  const [projectId] = useProjectScope();
  const allowed = !!user && canViewContract(user.roleKey);
  const { data, isLoading, error, refetch } = useBillingReadiness(projectId, allowed);
  const reminder = usePaymentReminder();

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Billing readiness" />
        <Result status="403" title="Billing readiness is for project managers, the QS, accounts and management" />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const letters = canViewLetters(user.roleKey);
  const draft = async (billId: string) => {
    try {
      const d = await reminder.mutateAsync(billId);
      requestNew('letter', () => router.push(DRAFT_PAGES.letter), d);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const late = data.rows.reduce((n, r) => n + r.unpaid.filter((b) => b.late).length, 0);
  const big = { content: { fontSize: token.fontSizeHeading4 } };

  const row = (r: BillingReadinessRowDto) => (
    <Card
      key={r.projectId}
      size="small"
      data-project={r.projectCode}
      title={
        <span translate="no">
          {r.projectCode} {r.projectName}
        </span>
      }
    >
      {r.clientName ? (
        <Typography.Paragraph type="secondary" translate="no" style={{ marginTop: -token.marginXXS }}>
          {r.clientName}
        </Typography.Paragraph>
      ) : null}
      <Flex vertical gap={token.marginSM}>
        {r.unbilledSheets ? (
          <p style={{ margin: 0 }}>
            <Typography.Text strong>Measured, not billed: </Typography.Text>
            <span translate="no">{formatINR(r.unbilledValue)}</span> at BOQ rates in {r.unbilledSheets === 1 ? '1 approved measurement' : `${r.unbilledSheets} approved measurements`}
            {r.oldestUnbilled ? `, the oldest of ${formatDate(r.oldestUnbilled)}` : ''}.{' '}
            <Link href={`/measurements?projectId=${r.projectId}&status=APPROVED`} className="text-link">
              Measurements
            </Link>
          </p>
        ) : null}
        {r.notSent.length ? (
          <div>
            <Typography.Text strong>Approved, not sent to the client:</Typography.Text>
            <ul style={{ margin: `${token.marginXXS}px 0 0`, paddingInlineStart: token.paddingLG }}>
              {r.notSent.map((b) => (
                <li key={b.billId}>
                  <Link href={`/bills/${b.billId}`} className="text-link">
                    {b.label}
                  </Link>{' '}
                  of {formatDate(b.billDate)}, <span translate="no">{formatINR(b.amount)}</span> net
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {r.unpaid.length ? (
          <div>
            <Typography.Text strong>Sent, not paid:</Typography.Text>
            <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginXXS }}>
              {r.unpaid.map((b) => (
                <Flex key={b.billId} data-bill={b.billId} wrap align="center" justify="space-between" gap={token.marginSM}>
                  <p style={{ margin: 0 }}>
                    <Link href={`/bills/${b.billId}`} className="text-link">
                      {b.label}
                    </Link>, <span translate="no">{formatINR(b.outstanding)}</span> unpaid, sent {formatDate(b.sentDate)}: {b.daysOutstanding} of the {b.expectedDays} days the client takes{' '}
                    {b.late ? <Tag color="red">Late</Tag> : null}
                  </p>
                  {letters ? (
                    <Button size="small" icon={<MailOutlined />} loading={reminder.isPending && reminder.variables === b.billId} onClick={() => void draft(b.billId)}>
                      Draft reminder
                    </Button>
                  ) : null}
                </Flex>
              ))}
            </Flex>
          </div>
        ) : null}
      </Flex>
    </Card>
  );

  return (
    <div className="page-container">
      <PageHeader title="Billing readiness" subtitle={`Money earned and not yet asked for, and money asked for and not yet paid, as of ${formatDate(data.asOf)}.`} />
      <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Measured, not billed" value={0} formatter={() => <span translate="no">{formatINRCompact(data.totals.unbilled)}</span>} styles={big} />
          <Typography.Text type="secondary">Approved measurements in no RA bill</Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Approved, not sent" value={0} formatter={() => <span translate="no">{formatINRCompact(data.totals.notSent)}</span>} styles={big} />
          <Typography.Text type="secondary">RA bills waiting to go to the client</Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Sent, not paid" value={0} formatter={() => <span translate="no">{formatINRCompact(data.totals.unpaid)}</span>} styles={big} />
          <Typography.Text type="secondary">
            {late ? (
              <>
                <span translate="no">{formatINRCompact(data.totals.pastDue)}</span> of it late ({late === 1 ? '1 bill' : `${late} bills`})
              </>
            ) : (
              'None past the days the client takes'
            )}
          </Typography.Text>
        </Card>
      </Flex>
      {data.rows.length ? (
        <Flex vertical gap={token.marginSM}>
          {data.rows.map(row)}
        </Flex>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting: every approved measurement is billed, every bill sent and paid." />
      )}
    </div>
  );
}
