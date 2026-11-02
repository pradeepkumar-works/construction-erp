'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Grid, Row, Skeleton, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import {
  AuditOutlined,
  CarryOutOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CreditCardOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HourglassOutlined,
  InboxOutlined,
  MailOutlined,
  ReconciliationOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SendOutlined,
  ShoppingCartOutlined,
  SyncOutlined,
  TeamOutlined,
  TruckOutlined,
  WalletOutlined,
} from '@/components/common/icons';
import type { MyWorkCard, MyWorkDto } from '@erp/shared';
import { rankWaiting } from '@erp/shared';
import { formatINRCompact, toNumber } from '@/lib/format';
import { tk } from '@/ds';
import { useResolved } from '@/ds/react';
import { QUEUE_TYPE_LABELS } from '@/components/approvals/queue';
import { LinkButton } from '@/components/common/LinkButton';
import type { MyWorkKey } from './layout';

/** A card's title, icon, list, and what its count counts (one, many), said beside the rupees when they lead ("3 bills"). */
export const CARDS: Record<Exclude<MyWorkKey, 'approvals'>, { title: string; icon: React.ReactNode; href: string | null; unit: [string, string] }> = {
  watchList: { title: 'Watch list', icon: <EyeOutlined />, href: '/watch-list', unit: ['warning', 'warnings'] },
  dprsMissing: { title: 'Daily reports not filed today', icon: <FileTextOutlined />, href: '/dpr', unit: ['project', 'projects'] },
  sentBack: { title: 'Sent back to you', icon: <RollbackOutlined />, href: null, unit: ['entry', 'entries'] },
  waitingWithOthers: { title: 'Waiting with others', icon: <HourglassOutlined />, href: null, unit: ['entry', 'entries'] },
  receivables: { title: 'Bills waiting for payment', icon: <WalletOutlined />, href: '/receivables', unit: ['bill', 'bills'] },
  payablesDue: { title: 'Payments due this week', icon: <CreditCardOutlined />, href: '/payables', unit: ['bill', 'bills'] },
  expiring: { title: 'Guarantees and licences expiring', icon: <SafetyCertificateOutlined />, href: '/compliance', unit: ['document', 'documents'] },
  lateDeliveries: { title: 'Late deliveries', icon: <TruckOutlined />, href: '/purchase-orders', unit: ['order', 'orders'] },
  lowStock: { title: 'Below minimum stock', icon: <InboxOutlined />, href: '/stock', unit: ['item', 'items'] },
  meetingActions: { title: 'Your actions from meetings', icon: <CarryOutOutlined />, href: '/meetings?view=actions&mine=1', unit: ['action', 'actions'] },
  letters: { title: 'Letters for you', icon: <MailOutlined />, href: '/correspondence?mine=1', unit: ['letter', 'letters'] },
  toOrder: { title: 'Requests to order', icon: <ShoppingCartOutlined />, href: '/requests-to-order', unit: ['request', 'requests'] },
  dueThisWeek: { title: 'Deliveries due this week', icon: <ScheduleOutlined />, href: '/purchase-orders?tab=status', unit: ['order', 'orders'] },
  staffToDecide: { title: 'Leave and overtime to decide', icon: <TeamOutlined />, href: '/staff?tab=leave', unit: ['request', 'requests'] },
  certifiedToReceive: { title: 'Certified, payment to come', icon: <FileDoneOutlined />, href: '/receivables', unit: ['bill', 'bills'] },
  toMatch: { title: 'Received, not billed', icon: <ReconciliationOutlined />, href: '/vendor-bills?tab=to-bill', unit: ['receipt', 'receipts'] },
  grnsToCheck: { title: 'Material to check', icon: <AuditOutlined />, href: '/inspections?tab=grns', unit: ['receipt', 'receipts'] },
  findingsToClose: { title: 'Audit findings to close', icon: <FileSearchOutlined />, href: '/qa-audits?open=1', unit: ['finding', 'findings'] },
  toDebit: { title: 'Debit notes to raise', icon: <SyncOutlined />, href: '/payables?tab=debit-notes&sub=to-raise', unit: ['receipt', 'receipts'] },
  transfersToReceive: { title: 'Material on the way', icon: <SendOutlined />, href: '/stock', unit: ['transfer', 'transfers'] },
};

export const APPROVALS_TITLE = 'Waiting for your approval';
const APPROVALS_UNIT: [string, string] = ['entry', 'entries'];

/** "3 bills": a count with its word, for the label under a card whose rupees lead. */
export const countWords = (n: number, [one, many]: [string, string]) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
export const unitOf = (k: MyWorkKey): [string, string] => (k === 'approvals' ? APPROVALS_UNIT : CARDS[k].unit);

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
  letters: 'letters',
  toOrder: 'requests to order',
  dueThisWeek: 'deliveries this week',
  staffToDecide: 'leave and overtime',
  certifiedToReceive: 'certified bills',
  toMatch: 'goods to match with a bill',
  grnsToCheck: 'material to check',
  findingsToClose: 'audit findings',
  toDebit: 'debit notes to raise',
  transfersToReceive: 'transfers on the way',
};

/** An approval starts to press after two days in the queue, as an entry waiting with others does (`HomeService.myWork`). */
const APPROVAL_PRESSES_AFTER = 2;

/**
 * How many days a card is past its own mark (negative while still ahead of it): the API's `urgencyDays`, and for approvals
 * how long the oldest has waited past two days. A card with no figure (an older API) counts as due today.
 */
export function urgencyOf(data: MyWorkDto, k: MyWorkKey): number {
  if (k === 'approvals') return data.approvalsWaitingDays == null ? 0 : data.approvalsWaitingDays - APPROVAL_PRESSES_AFTER;
  return (data[k] as MyWorkCard | undefined)?.urgencyDays ?? 0;
}

/** The rupees a card holds: the card's amount, and for approvals the amounts waiting on the caller; null where none is money. */
export function amountOf(data: MyWorkDto, k: MyWorkKey): string | null {
  if (k !== 'approvals') return (data[k] as MyWorkCard | undefined)?.amount ?? null;
  const priced = (data.approvals ?? []).filter((a) => a.amount != null);
  return priced.length ? String(priced.reduce((s, a) => s + toNumber(a.amount), 0)) : null;
}

/**
 * The cards that have something waiting, in the one order for what waits (`rankWaiting`): the bigger money first, then
 * the later past its mark, then the role's layout (`homeLayout`). Cards with nothing waiting are left out.
 */
export function myWorkOrder(data: MyWorkDto, order: MyWorkKey[], count: (k: MyWorkKey) => number): MyWorkKey[] {
  const busy = order.filter((k) => data[k] !== undefined && count(k) > 0);
  return rankWaiting(busy, (k, place) => ({ amount: amountOf(data, k), daysLate: urgencyOf(data, k), place }));
}

/**
 * What needs this user now, most urgent first. Cards with nothing waiting fold into
 * one "Nothing else waiting" line; when everything is clear one line says so.
 */
export function MyWorkPanel({ data, loading, order }: { data: MyWorkDto | undefined; loading: boolean; order: MyWorkKey[] }) {
  const { space } = useResolved();
  if (loading) {
    return (
      <Card title="My work" style={{ marginBottom: tk.space[4] }}>
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
    <Card title="My work" style={{ marginBottom: tk.space[4] }} extra={busy.length === 0 ? <AppTag meaning="done">All caught up</AppTag> : undefined}>
      {busy.length === 0 ? (
        <Flex align="center" gap={tk.space[2]}>
          <CheckCircleOutlined style={{ color: tk.color.tone.success.solid }} aria-hidden />
          <Typography.Text type="secondary">Nothing waits for you right now.</Typography.Text>
        </Flex>
      ) : (
        <>
          <Row gutter={[space[4], space[4]]}>
            {busy.map((k) => (
              <Col key={k} xs={24} md={12} xl={8}>
                {k === 'approvals' ? <ApprovalsCard data={data} /> : <WorkCard k={k} card={data[k] as MyWorkCard} />}
              </Col>
            ))}
          </Row>
          {clear.length > 0 && (
            <Flex align="center" gap={tk.space[2]} style={{ marginTop: tk.space[4] }}>
              <CheckCircleOutlined style={{ color: tk.color.tone.success.solid }} aria-hidden />
              <Typography.Text type="secondary">Nothing else waiting: {clear.map((k) => CLEAR[k]).join(', ')}.</Typography.Text>
            </Flex>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * One card. Rupees lead where the card holds money, with the count and its word under the title ("3 bills"); a card
 * without money leads with its count. A card past its own mark says Overdue in words, never by colour alone.
 */
function Frame({ title, icon, href, count, unit, amount, daysLate, children }: { title: string; icon: React.ReactNode; href: string | null; count: number; unit: [string, string]; amount: string | null; daysLate: number; children: React.ReactNode }) {
  const money = !!amount && count > 0;
  const late = count > 0 && daysLate > 0;
  return (
    <section
      aria-label={title}
      // A part of the My work card, so a hairline above it rather than a box around it (no cards inside cards).
      style={{ height: '100%', paddingTop: tk.space[3], borderTop: tk.line('hairline') }}
    >
      <Flex align="center" gap={tk.space[3]} style={{ marginBottom: tk.space[2] }}>
        {/* A plain grey glyph rather than a tinted square: the figure and the words say what matters. */}
        <span aria-hidden style={{ display: 'inline-flex', color: count === 0 ? tk.color.tone.success.fg : tk.color.text.faint, fontSize: tk.type.lead.fontSize }}>
          {count === 0 ? <CheckCircleOutlined /> : icon}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {href ? (
            <Link href={href} style={{ color: tk.color.text.base, fontWeight: tk.type.title.fontWeight }}>
              {title}
            </Link>
          ) : (
            <Typography.Text strong>{title}</Typography.Text>
          )}
          {(money || late) && (
            <Flex align="center" wrap gap={tk.space[2]}>
              {money && (
                <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                  <span translate="no">{count.toLocaleString('en-IN')}</span> {count === 1 ? unit[0] : unit[1]}
                </Typography.Text>
              )}
              {late && <AppTag meaning="failed">Overdue</AppTag>}
            </Flex>
          )}
        </div>
        <span translate="no" style={{ ...tk.type.figure, whiteSpace: 'nowrap', color: count === 0 ? tk.color.text.muted : tk.color.text.base }}>
          {money ? formatINRCompact(amount) : count}
        </span>
      </Flex>
      {children}
    </section>
  );
}

function ApprovalsCard({ data }: { data: MyWorkDto }) {
  const approvals = data.approvals ?? [];
  const waitingDays = data.approvalsWaitingDays ?? null;
  const total = approvals.reduce((n, a) => n + a.count, 0);
  return (
    <Frame title={APPROVALS_TITLE} icon={<CheckSquareOutlined />} href="/approvals" count={total} unit={APPROVALS_UNIT} amount={amountOf(data, 'approvals')} daysLate={urgencyOf(data, 'approvals')}>
      {total === 0 ? (
        <Typography.Text type="secondary">Nothing to approve.</Typography.Text>
      ) : (
        <Flex wrap gap={tk.space[1]}>
          {waitingDays !== null && (
            <Typography.Text type="secondary" style={{ display: 'block', width: '100%', fontSize: tk.type.caption.fontSize }}>
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
  const meta = CARDS[k];
  // A card may point somewhere of the user's own (the store keeper's deliveries open Stock, not Purchase orders).
  const href = card.href ?? meta.href;
  // A phone stacks the cards, so each shows its first item only and links to the rest.
  const items = Grid.useBreakpoint().sm === false ? card.items.slice(0, 1) : card.items;
  return (
    <Frame title={meta.title} icon={meta.icon} href={href} count={card.count} unit={meta.unit} amount={card.amount} daysLate={card.urgencyDays ?? 0}>
      {card.count === 0 ? (
        <Typography.Text type="secondary">Nothing to do.</Typography.Text>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((i) => (
            <li key={`${i.href}-${i.label}`} style={{ padding: `${tk.space[1]} 0`, borderTop: tk.line('hairline') }}>
              <Flex justify="space-between" gap={tk.space[2]} align="baseline">
                <Link href={i.href} className="text-link" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.label}>
                  {i.label}
                </Link>
                {i.amount ? (
                  <Typography.Text className="mono" style={{ whiteSpace: 'nowrap', fontSize: tk.type.caption.fontSize }}>
                    {formatINRCompact(i.amount)}
                  </Typography.Text>
                ) : null}
              </Flex>
              <Typography.Text type="secondary" ellipsis style={{ fontSize: tk.type.caption.fontSize, display: 'block' }}>
                {[i.note, i.projectName].filter(Boolean).join(' · ')}
              </Typography.Text>
            </li>
          ))}
          {card.count > items.length && href && (
            <li style={{ paddingTop: tk.space[1] }}>
              <Link href={href} className="text-link" style={{ fontSize: tk.type.caption.fontSize }}>
                {card.count - items.length} more
              </Link>
            </li>
          )}
        </ul>
      )}
    </Frame>
  );
}

