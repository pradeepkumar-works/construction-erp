'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Grid, Row, Skeleton, Tag, Typography, theme } from 'antd';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  CreditCardOutlined,
  FileTextOutlined,
  InboxOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  TruckOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { MyWorkCard, MyWorkDto } from '@erp/shared';
import { formatINRCompact } from '@/lib/format';
import { QUEUE_TYPE_LABELS } from '@/components/approvals/queue';
import type { MyWorkKey } from './layout';

const CARDS: Record<Exclude<MyWorkKey, 'approvals'>, { title: string; icon: React.ReactNode; href: string | null; tone: 'warning' | 'error' | 'info' }> = {
  dprsMissing: { title: 'DPRs not filed today', icon: <FileTextOutlined />, href: '/dpr', tone: 'warning' },
  sentBack: { title: 'Sent back to you', icon: <RollbackOutlined />, href: null, tone: 'warning' },
  receivables: { title: 'Bills awaiting payment', icon: <WalletOutlined />, href: '/receivables', tone: 'info' },
  payablesDue: { title: 'Payments due this week', icon: <CreditCardOutlined />, href: '/payables', tone: 'error' },
  expiring: { title: 'Guarantees and policies expiring', icon: <SafetyCertificateOutlined />, href: '/compliance', tone: 'warning' },
  lateDeliveries: { title: 'Late deliveries', icon: <TruckOutlined />, href: '/purchase-orders', tone: 'error' },
  lowStock: { title: 'Below minimum stock', icon: <InboxOutlined />, href: '/stock', tone: 'warning' },
};

/**
 * What needs this user now (UI roadmap item 59), in the order their layout gives. Empty cards are left out, except the
 * first two, which say there is nothing to do; when everything is clear one line says so.
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
  const busy = present.filter((k) => count(k) > 0);
  const shown = present.filter((k, i) => count(k) > 0 || (i < 2 && k !== 'sentBack'));
  if (!present.length) return null;

  return (
    <Card title="My work" style={{ marginBottom: token.margin }} extra={busy.length === 0 ? <Tag color="success">All caught up</Tag> : undefined}>
      {busy.length === 0 ? (
        <Flex align="center" gap={token.marginXS}>
          <CheckCircleOutlined style={{ color: token.colorSuccess }} aria-hidden />
          <Typography.Text type="secondary">Nothing waits for you right now.</Typography.Text>
        </Flex>
      ) : (
        <Row gutter={[token.margin, token.margin]}>
          {shown.map((k) => (
            <Col key={k} xs={24} md={12} xl={8}>
              {k === 'approvals' ? <ApprovalsCard approvals={data.approvals ?? []} /> : <WorkCard k={k} card={data[k] as MyWorkCard} />}
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}

function Frame({ title, icon, href, count, tone, children, amount }: { title: string; icon: React.ReactNode; href: string | null; count: number; tone: 'warning' | 'error' | 'info'; amount?: string | null; children: React.ReactNode }) {
  const { token } = theme.useToken();
  const color = count === 0 ? token.colorSuccess : tone === 'error' ? token.colorError : tone === 'warning' ? token.colorWarning : token.colorPrimary;
  // The count is text, so it takes the text shade of the tone (the warning yellow does not read on white).
  const figure = tone === 'error' ? token.colorErrorText : tone === 'warning' ? token.colorWarningText : token.colorPrimaryText;
  const bg = count === 0 ? token.colorSuccessBg : tone === 'error' ? token.colorErrorBg : tone === 'warning' ? token.colorWarningBg : token.colorPrimaryBg;
  return (
    <section
      aria-label={title}
      style={{ height: '100%', padding: token.paddingSM, border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}
    >
      <Flex align="center" gap={token.marginSM} style={{ marginBottom: token.marginXS }}>
        <span
          aria-hidden
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: token.controlHeight, height: token.controlHeight, borderRadius: token.borderRadius, background: bg, color, fontSize: token.fontSizeLG }}
        >
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
        <span style={{ fontSize: token.fontSizeHeading3, fontWeight: token.fontWeightStrong, color: count === 0 ? token.colorTextTertiary : figure, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </Flex>
      {children}
    </section>
  );
}

function ApprovalsCard({ approvals }: { approvals: NonNullable<MyWorkDto['approvals']> }) {
  const { token } = theme.useToken();
  const total = approvals.reduce((n, a) => n + a.count, 0);
  return (
    <Frame title="Waiting for your approval" icon={<CheckSquareOutlined />} href="/approvals" count={total} tone="warning">
      {total === 0 ? (
        <Typography.Text type="secondary">Nothing to approve.</Typography.Text>
      ) : (
        <Flex wrap gap={token.marginXXS}>
          {[...approvals]
            .sort((a, b) => b.count - a.count)
            .map((a) => (
              <Link key={a.type} href="/approvals">
                <Tag style={{ margin: 0, cursor: 'pointer' }}>
                  {QUEUE_TYPE_LABELS[a.type]} <strong>{a.count}</strong>
                </Tag>
              </Link>
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
    <Frame title={meta.title} icon={meta.icon} href={meta.href} count={card.count} tone={meta.tone} amount={card.amount}>
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

