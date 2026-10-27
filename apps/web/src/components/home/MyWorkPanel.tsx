'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Grid, Row, Skeleton, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import {
  CarryOutOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CreditCardOutlined,
  EyeOutlined,
  FileTextOutlined,
  HourglassOutlined,
  InboxOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  TruckOutlined,
  WalletOutlined,
} from '@/components/common/icons';
import type { MyWorkCard, MyWorkDto } from '@erp/shared';
import { formatINRCompact } from '@/lib/format';
import { QUEUE_TYPE_LABELS } from '@/components/approvals/queue';
import { LinkButton } from '@/components/common/LinkButton';
import type { MyWorkKey } from './layout';

const CARDS: Record<Exclude<MyWorkKey, 'approvals'>, { title: string; icon: React.ReactNode; href: string | null; tone: 'warning' | 'error' | 'info' }> = {
  watchList: { title: 'Watch list', icon: <EyeOutlined />, href: '/watch-list', tone: 'warning' },
  dprsMissing: { title: 'DPRs not filed today', icon: <FileTextOutlined />, href: '/dpr', tone: 'warning' },
  sentBack: { title: 'Sent back to you', icon: <RollbackOutlined />, href: null, tone: 'warning' },
  waitingWithOthers: { title: 'Waiting with others', icon: <HourglassOutlined />, href: null, tone: 'info' },
  receivables: { title: 'Bills awaiting payment', icon: <WalletOutlined />, href: '/receivables', tone: 'info' },
  payablesDue: { title: 'Payments due this week', icon: <CreditCardOutlined />, href: '/payables', tone: 'error' },
  expiring: { title: 'Guarantees and policies expiring', icon: <SafetyCertificateOutlined />, href: '/compliance', tone: 'warning' },
  lateDeliveries: { title: 'Late deliveries', icon: <TruckOutlined />, href: '/purchase-orders', tone: 'error' },
  lowStock: { title: 'Below minimum stock', icon: <InboxOutlined />, href: '/stock', tone: 'warning' },
  meetingActions: { title: 'Your actions from meetings', icon: <CarryOutOutlined />, href: '/meetings?view=actions&mine=1', tone: 'warning' },
};

const APPROVALS_TITLE = 'Waiting for your approval';

/** What each card is about, inside the "Nothing else waiting" line. */
const CLEAR: Record<MyWorkKey, string> = {
  approvals: 'approvals',
  watchList: 'watch list',
  dprsMissing: 'DPRs',
  sentBack: 'entries sent back',
  waitingWithOthers: 'your entries waiting',
  receivables: 'client bills',
  payablesDue: 'payments due',
  expiring: 'expiring guarantees and policies',
  lateDeliveries: 'deliveries',
  lowStock: 'stock levels',
  meetingActions: 'meeting actions',
};

/**
 * How pressing a card is, in days overdue, late or waiting (UX item 85): the API's `urgencyDays`, and for approvals how
 * long the oldest has waited. A card with no figure (an older API) ranks as due today.
 */
export function urgencyOf(data: MyWorkDto, k: MyWorkKey): number {
  const days = k === 'approvals' ? data.approvalsWaitingDays : (data[k] as MyWorkCard | undefined)?.urgencyDays;
  return days ?? 0;
}

/**
 * The cards that have something waiting, most urgent first (UX item 85): longest overdue or waiting first; cards
 * equally urgent keep the order of the role's layout (`homeLayout`). Cards with nothing waiting are left out.
 */
export function myWorkOrder(data: MyWorkDto, order: MyWorkKey[], count: (k: MyWorkKey) => number): MyWorkKey[] {
  return order
    .filter((k) => data[k] !== undefined && count(k) > 0)
    .map((k, i) => ({ k, i, u: urgencyOf(data, k) }))
    .sort((a, b) => b.u - a.u || a.i - b.i)
    .map((x) => x.k);
}

/**
 * What needs this user now (UI roadmap item 59), most urgent first (UX item 85). Cards with nothing waiting fold into
 * one "Nothing else waiting" line; when everything is clear one line says so.
 */
export function MyWorkPanel({ data, loading, order }: { data: MyWorkDto | undefined; loading: boolean; order: MyWorkKey[] }) {
  const { token } = theme.useToken();
  if (loading) {
    return (
      <Card title="My work" style={{ marginBottom: token.margin }}>
        <Skeleton active paragraph={{ rows: 3 }} />
      </Card>
    );
  }
  if (!data) return null;
  const present = order.filter((k) => data[k] !== undefined);
  const count = (k: MyWorkKey) => (k === 'approvals' ? (data.approvals ?? []).reduce((n, a) => n + a.count, 0) : (data[k] as MyWorkCard).count);
  const busy = myWorkOrder(data, order, count);
  const clear = present.filter((k) => count(k) === 0);
  if (!present.length) return null;

  return (
    <Card title="My work" style={{ marginBottom: token.margin }} extra={busy.length === 0 ? <AppTag tone="success">All caught up</AppTag> : undefined}>
      {busy.length === 0 ? (
        <Flex align="center" gap={token.marginXS}>
          <CheckCircleOutlined style={{ color: token.colorSuccess }} aria-hidden />
          <Typography.Text type="secondary">Nothing waits for you right now.</Typography.Text>
        </Flex>
      ) : (
        <>
          <Row gutter={[token.margin, token.margin]}>
            {busy.map((k) => (
              <Col key={k} xs={24} md={12} xl={8}>
                {k === 'approvals' ? <ApprovalsCard approvals={data.approvals ?? []} waitingDays={data.approvalsWaitingDays ?? null} /> : <WorkCard k={k} card={data[k] as MyWorkCard} />}
              </Col>
            ))}
          </Row>
          {clear.length > 0 && (
            <Flex align="center" gap={token.marginXS} style={{ marginTop: token.margin }}>
              <CheckCircleOutlined style={{ color: token.colorSuccess }} aria-hidden />
              <Typography.Text type="secondary">Nothing else waiting: {clear.map((k) => CLEAR[k]).join(', ')}.</Typography.Text>
            </Flex>
          )}
        </>
      )}
    </Card>
  );
}

function Frame({ title, icon, href, count, tone, children, amount, overdue }: { title: string; icon: React.ReactNode; href: string | null; count: number; tone: 'warning' | 'error' | 'info'; amount?: string | null; overdue?: boolean; children: React.ReactNode }) {
  const { token } = theme.useToken();
  // A count is neutral; only a card of exceptions (late deliveries, payments due) colours it, in the text shade (UX item
  // 82), and only while something in it is actually overdue (UX item 85): payments due later this week stay neutral.
  const figure = tone === 'error' && overdue !== false ? token.colorErrorText : token.colorText;
  return (
    <section
      aria-label={title}
      // A part of the My work card, so a hairline above it rather than a box around it (UX item 82: no cards inside cards).
      style={{ height: '100%', paddingTop: token.paddingSM, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}
    >
      <Flex align="center" gap={token.marginSM} style={{ marginBottom: token.marginXS }}>
        {/* A plain grey glyph rather than a tinted square: the colour is kept for the figure, where it says something. */}
        <span aria-hidden style={{ display: 'inline-flex', color: count === 0 ? token.colorSuccessText : token.colorTextTertiary, fontSize: token.fontSizeLG }}>
          {count === 0 ? <CheckCircleOutlined /> : icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {href ? (
            <Link href={href} style={{ color: token.colorText, fontWeight: token.fontWeightStrong }}>
              {title}
            </Link>
          ) : (
            <Typography.Text strong>{title}</Typography.Text>
          )}
          {amount && count > 0 ? (
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
              {formatINRCompact(amount)}
            </Typography.Text>
          ) : null}
        </div>
        <span style={{ fontSize: token.fontSizeHeading2, fontWeight: token.fontWeightStrong, color: count === 0 ? token.colorTextTertiary : figure, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </Flex>
      {children}
    </section>
  );
}

function ApprovalsCard({ approvals, waitingDays }: { approvals: NonNullable<MyWorkDto['approvals']>; waitingDays: number | null }) {
  const { token } = theme.useToken();
  const total = approvals.reduce((n, a) => n + a.count, 0);
  return (
    <Frame title={APPROVALS_TITLE} icon={<CheckSquareOutlined />} href="/approvals" count={total} tone="warning">
      {total === 0 ? (
        <Typography.Text type="secondary">Nothing to approve.</Typography.Text>
      ) : (
        <Flex wrap gap={token.marginXXS}>
          {waitingDays !== null && (
            <Typography.Text type="secondary" style={{ display: 'block', width: '100%', fontSize: token.fontSizeSM }}>
              {waitingDays === 0 ? 'All sent today' : `Oldest waiting ${waitingDays} day${waitingDays === 1 ? '' : 's'}`}
            </Typography.Text>
          )}
          {[...approvals]
            .sort((a, b) => b.count - a.count)
            .map((a) => (
              <LinkButton key={a.type} href="/approvals" size="small">
                {QUEUE_TYPE_LABELS[a.type]} <strong>{a.count}</strong>
              </LinkButton>
            ))}
        </Flex>
      )}
    </Frame>
  );
}

function WorkCard({ k, card }: { k: Exclude<MyWorkKey, 'approvals'>; card: MyWorkCard }) {
  const { token } = theme.useToken();
  const meta = CARDS[k];
  // A phone stacks the cards, so each shows its first item only and links to the rest.
  const items = Grid.useBreakpoint().sm === false ? card.items.slice(0, 1) : card.items;
  return (
    <Frame title={meta.title} icon={meta.icon} href={meta.href} count={card.count} tone={meta.tone} amount={card.amount} overdue={card.urgencyDays == null ? undefined : card.urgencyDays > 0}>
      {card.count === 0 ? (
        <Typography.Text type="secondary">Nothing to do.</Typography.Text>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((i) => (
            <li key={`${i.href}-${i.label}`} style={{ padding: `${token.paddingXXS}px 0`, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` }}>
              <Flex justify="space-between" gap={token.marginXS} align="baseline">
                <Link href={i.href} className="text-link" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.label}>
                  {i.label}
                </Link>
                {i.amount ? (
                  <Typography.Text className="mono" style={{ whiteSpace: 'nowrap', fontSize: token.fontSizeSM }}>
                    {formatINRCompact(i.amount)}
                  </Typography.Text>
                ) : null}
              </Flex>
              <Typography.Text type="secondary" ellipsis style={{ fontSize: token.fontSizeSM, display: 'block' }}>
                {[i.note, i.projectName].filter(Boolean).join(' · ')}
              </Typography.Text>
            </li>
          ))}
          {card.count > items.length && meta.href && (
            <li style={{ paddingTop: token.paddingXXS }}>
              <Link href={meta.href} className="text-link" style={{ fontSize: token.fontSizeSM }}>
                {card.count - items.length} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </Frame>
  );
}

