'use client';

import React, { useState } from 'react';
import { App, Button, Card, Col, Empty, Flex, Form, Grid, Input, Row, Space, Statistic, Table, Typography, theme } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CheckCircleOutlined, DeleteOutlined, EditOutlined, MailOutlined, PlusOutlined, ShoppingCartOutlined, TrophyOutlined } from '@/components/common/icons';
import type { ComparativeStatementDto, EnquiryDto, MaterialRequestDto, MaterialRequestItemDto, QuotationDto, RankedQuote, RequestToOrderDto } from '@erp/shared';
import { ORDER_STAGES, awardLowestPerItem, canPurchase, enquiryOpen, finaliseProblem, lastRateKey, rankLabel, type OrderStage } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useUrlTab } from '@/lib/url-state';
import { useComparative, useFinaliseL1, useLastRates, useMaterialRequest, useRequestToOrder } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { StageBar } from '@/components/record/StageBar';
import { FormShell } from '@/components/form/FormShell';
import { EnquiriesList, EnquiryFormModal, EnquirySentModal } from './Enquiries';
import { QuotationFormModal } from './QuotationFormModal';
import { PurchaseOrderFormModal, type PoStart } from './PurchaseOrderFormModal';
import { PurchaseOrderDrawer } from './PurchaseOrderDrawer';
import { AwardLowestModal } from './AwardLowestModal';
import { ComparativeTable, RequestOrders, poStartFrom, ranksFor, toOrderOfRequest } from './RequestBuying';

const STEPS = ['enquiries', 'quotations', 'finalise', 'orders'] as const;
type Step = (typeof STEPS)[number];
/** The step a request opens on: the one its stage waits on. */
const STEP_OF: Record<OrderStage, Step> = { TO_ENQUIRE: 'enquiries', AWAITING_QUOTES: 'enquiries', TO_FINALISE: 'finalise', READY: 'orders' };

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{children}</div>;
}

/**
 * One request as purchase works it (Purchases › Requests to order): a step each for sending the enquiry, the quotations
 * as they come in, finalising L1 with the comparison in front of you, and raising the order from what was finalised.
 */
export function RequestToOrderScreen({ id }: { id: string }) {
  const { user } = useAuth();
  const row = useRequestToOrder(id);
  const mr = useMaterialRequest(id);
  const cs = useComparative(id);
  const r = row.data;
  const [tab, setTab] = useUrlTab<Step>(STEPS, r ? STEP_OF[r.stage] : 'enquiries', { param: 'tab' });

  if (row.isLoading || mr.isLoading) return <div className="page-container"><PageSkeleton shape="workspace" /></div>;
  if (row.error || mr.error || !r || !mr.data)
    return (
      <div className="page-container">
        <QueryError error={row.error ?? mr.error} onRetry={() => { row.refetch(); mr.refetch(); }} />
      </div>
    );
  const request = mr.data;
  const buyer = !!user && canPurchase(user.roleKey);
  const at = ORDER_STAGES.indexOf(r.stage);
  const done = r.itemsLeft === 0;

  return (
    <div className="page-container">
      <PageHeader
        title={r.requestNo}
        docTitle={`${r.requestNo} · Requests to order`}
        crumbs={[{ title: 'Requests to order', href: '/requests-to-order' }, { title: r.requestNo }]}
        subtitle={
          <span>
            <span translate="no">{r.projectName}</span> · needed by {formatDate(r.requiredDate)} · raised by <span translate="no">{r.submittedByName}</span>
            {r.approvedAt ? `, approved ${formatDate(r.approvedAt)}` : ''}
          </span>
        }
        extra={<LinkButton href={`/material-requests/${r.id}`}>Open the indent</LinkButton>}
      />
      <Card size="small">
        <StageBar
          label="Where this indent stands"
          current={done ? 3 : at}
          status={done ? 'finish' : 'process'}
          style={{ marginBottom: 12 }}
          items={[
            { title: 'Enquiry', content: r.enquiry ? `${r.enquiry.replied} of ${r.enquiry.invited} replied` : 'Not sent' },
            { title: 'Quotations', content: `${r.quotations} quotation${r.quotations === 1 ? '' : 's'} in` },
            { title: 'Finalise L1', content: r.final ? (r.final.split ? 'L1 per item' : (r.final.vendorName ?? 'Finalised')) : r.l1 ? `L1 ${r.l1.vendorName}` : 'Waiting for quotations' },
            { title: 'Purchase order', content: done ? 'Everything ordered' : r.orders ? `${r.orders} made, ${r.itemsLeft} item${r.itemsLeft === 1 ? '' : 's'} left` : 'To make' },
          ]}
        />
        <AppTabs
          variant="page"
          activeKey={tab}
          onChange={(k) => setTab(k as Step)}
          items={[
            { key: 'enquiries', label: 'Enquiry', children: <EnquiryStep request={request} row={r} buyer={buyer} onNext={() => setTab('quotations')} /> },
            { key: 'quotations', label: 'Quotations', count: r.quotations, countLabel: r.quotations === 1 ? 'quotation' : 'quotations', children: <QuotationsStep request={request} cs={cs.data} loading={cs.isLoading} buyer={buyer} onNext={() => setTab('finalise')} /> },
            { key: 'finalise', label: 'Finalise L1', attention: r.stage === 'TO_FINALISE', children: <FinaliseStep request={request} row={r} cs={cs.data} buyer={buyer} onNext={() => setTab('orders')} /> },
            { key: 'orders', label: 'Purchase order', count: r.orders || undefined, countLabel: r.orders === 1 ? 'order' : 'orders', attention: r.stage === 'READY', children: <OrdersStep request={request} row={r} cs={cs.data} buyer={buyer} onFinalise={() => setTab('finalise')} /> },
          ]}
        />
      </Card>
    </div>
  );
}

/* ---------- 1. Enquiry ---------- */

function EnquiryStep({ request, row, buyer, onNext }: { request: MaterialRequestDto; row: RequestToOrderDto; buyer: boolean; onNext: () => void }) {
  const { token } = theme.useToken();
  const [enquiring, setEnquiring] = useState(false);
  const [sent, setSent] = useState<EnquiryDto | null>(null);
  const left = request.items.filter((i) => toNumber(i.toOrderQty) > 0);
  const waiting = row.enquiry && enquiryOpen(row.enquiry, dayjs().format('YYYY-MM-DD'));
  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
        <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
          What to buy
        </Typography.Title>
        {buyer && left.length > 0 ? (
          <Button type={row.enquiry ? 'default' : 'primary'} icon={<MailOutlined />} onClick={() => setEnquiring(true)}>
            {row.enquiry ? 'Send another enquiry' : 'Send enquiry'}
          </Button>
        ) : null}
      </Flex>
      <ItemsToBuy items={request.items} />
      <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: `${token.marginLG}px 0 ${token.marginSM}px` }}>
        Enquiries sent
      </Typography.Title>
      {row.enquiry ? (
        <>
          <EnquiriesList requestId={request.id} />
          <Flex justify="space-between" align="center" wrap gap={token.marginXS}>
            <Typography.Text type="secondary">
              {waiting
                ? `${row.enquiry.replied} of ${row.enquiry.invited} vendors have replied. The links work until ${formatDate(row.enquiry.closesOn)}; replies land on the quotations.`
                : `${row.enquiry.replied} of ${row.enquiry.invited} vendors replied.`}
            </Typography.Text>
            {row.quotations > 0 ? <Button onClick={onNext}>See the quotations</Button> : null}
          </Flex>
        </>
      ) : (
        <Typography.Paragraph type="secondary">
          No enquiry sent yet. Each vendor you choose gets a link to type their rates, GST, freight and delivery days, with no sign-in. A quotation that came by
          email or phone is recorded under Quotations.
        </Typography.Paragraph>
      )}
      <EnquiryFormModal open={enquiring} request={request} onClose={() => setEnquiring(false)} onSent={setSent} />
      <EnquirySentModal enquiry={sent} request={request} onClose={() => setSent(null)} />
    </>
  );
}

function ItemsToBuy({ items }: { items: MaterialRequestItemDto[] }) {
  return (
    <Table<MaterialRequestItemDto>
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={items}
      scroll={{ x: 600 }}
      columns={[
        { title: 'Item', dataIndex: 'itemName', render: (v, i) => <div>{v}{i.specification ? <Muted>{i.specification}</Muted> : null}</div> },
        { title: 'Asked for', dataIndex: 'quantity', align: 'right', width: 120, render: (v, i) => <span translate="no">{formatQty(v)} {i.unit}</span> },
        {
          title: 'Ordered or met',
          key: 'got',
          align: 'right',
          width: 140,
          render: (_, i) => {
            const got = toNumber(i.quantity) - toNumber(i.toOrderQty);
            return got > 0 ? <span translate="no">{formatQty(got)} {i.unit}</span> : <span className="text-muted">0</span>;
          },
        },
        {
          title: 'Still to order',
          dataIndex: 'toOrderQty',
          align: 'right',
          width: 140,
          render: (v, i) => (toNumber(v) > 0 ? <strong translate="no">{formatQty(v)} {i.unit}</strong> : <AppTag tone="success" style={{ margin: 0 }}>Done</AppTag>),
        },
      ]}
    />
  );
}

/* ---------- 2. Quotations ---------- */

function QuotationsStep({ request, cs, loading, buyer, onNext }: { request: MaterialRequestDto; cs: ComparativeStatementDto | undefined; loading: boolean; buyer: boolean; onNext: () => void }) {
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const [quoting, setQuoting] = useState<QuotationDto | 'new' | null>(null);
  const ranked = new Map(ranksFor(request, cs).map((x) => [x.quotationId, x]));
  const left = request.items.filter((i) => toNumber(i.toOrderQty) > 0).length;
  const today = dayjs().format('YYYY-MM-DD');
  const remove = useMutation({
    mutationFn: async (qid: string) => (await api.delete(`/quotations/${qid}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotations'] }),
    meta: FAIL_NOTICE,
  });
  const quotes = cs?.quotations ?? [];
  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
        <Typography.Text type="secondary">Replies to the enquiry come in here by themselves. Record a quotation that came by email, letter or phone.</Typography.Text>
        <Space wrap>
          {buyer ? (
            <Button icon={<PlusOutlined />} onClick={() => setQuoting('new')}>
              Record quotation
            </Button>
          ) : null}
          {quotes.length ? (
            <Button type="primary" onClick={onNext}>
              Compare and finalise L1
            </Button>
          ) : null}
        </Space>
      </Flex>
      <Table<QuotationDto>
        size="small"
        rowKey="id"
        pagination={false}
        loading={loading}
        dataSource={quotes}
        scroll={{ x: 980 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations yet" /> }}
        columns={[
          {
            title: 'Vendor',
            key: 'vendor',
            render: (_, q) => (
              <div>
                <span translate="no">{q.vendorName}</span>
                <Muted>{q.fromSupplier ? 'Typed by the vendor on the enquiry link' : `Recorded by ${q.createdByName}`}</Muted>
              </div>
            ),
          },
          { title: 'Quotation', key: 'ref', width: 150, render: (_, q) => <div>{q.quoteRef ? <span className="mono" translate="no">{q.quoteRef}</span> : <span className="text-muted">No ref.</span>}<Muted>{formatDate(q.quoteDate)}</Muted></div> },
          {
            title: 'Valid until',
            dataIndex: 'validUntil',
            width: 130,
            render: (v: string | null) => (v ? v < today ? <AppTag tone="danger" style={{ margin: 0 }}>Expired {formatDate(v)}</AppTag> : formatDate(v) : <span className="text-muted">{NO_VALUE}</span>),
          },
          { title: 'Delivery', dataIndex: 'deliveryDays', width: 100, align: 'right', render: (v: number | null) => (v != null ? `${v} days` : <span className="text-muted">{NO_VALUE}</span>) },
          { title: 'Payment', dataIndex: 'paymentTerms', width: 150, ellipsis: true, render: (v: string | null) => v ?? <span className="text-muted">{NO_VALUE}</span> },
          {
            title: 'Items quoted',
            key: 'covers',
            width: 130,
            render: (_, q) => {
              const x = ranked.get(q.id);
              return x && x.missing ? <Typography.Text type="warning">{left - x.missing} of {left}</Typography.Text> : `All ${left || request.items.length}`;
            },
          },
          {
            title: 'For what is left',
            key: 'total',
            width: 170,
            align: 'right',
            render: (_, q) => {
              const x = ranked.get(q.id);
              return (
                <div>
                  <strong className="mono" translate="no">{x ? formatINR(x.total, true) : NO_VALUE}</strong>
                  {x?.rank ? <div><AppTag tone={x.rank === 1 ? 'success' : 'neutral'} style={{ margin: 0 }}>{rankLabel(x.rank)}</AppTag></div> : null}
                </div>
              );
            },
          },
          ...(buyer
            ? [
                {
                  title: '',
                  key: 'actions',
                  width: 96,
                  render: (_: unknown, q: QuotationDto) => (
                    <Space size={0}>
                      <Button type="text" icon={<EditOutlined />} aria-label={`Edit quotation from ${q.vendorName}`} onClick={() => setQuoting(q)} />
                      <ConfirmDelete what={`the quotation from ${q.vendorName}`} onConfirm={() => remove.mutateAsync(q.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete quotation from ${q.vendorName}`} />
                      </ConfirmDelete>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      <QuotationFormModal open={!!quoting} request={request} quotation={quoting === 'new' ? null : quoting} onClose={() => setQuoting(null)} />
    </>
  );
}

/* ---------- 3. Finalise L1 ---------- */

function FinaliseStep({ request, row, cs, buyer, onNext }: { request: MaterialRequestDto; row: RequestToOrderDto; cs: ComparativeStatementDto | undefined; buyer: boolean; onNext: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { finalise, reopen } = useFinaliseL1(request.id);
  const [choosing, setChoosing] = useState<RankedQuote | null>(null);
  const screens = Grid.useBreakpoint();
  const last = useLastRates(request.items);
  const ranked = ranksFor(request, cs);
  const quotes = cs?.quotations ?? [];
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const l1 = ranked.find((x) => x.rank === 1);
  const l2 = ranked.find((x) => x.rank === 2);
  const toOrder = toOrderOfRequest(request);
  const plan = cs ? awardLowestPerItem(cs, toOrder) : null;
  const split = plan && plan.orders.length > 1 ? plan : null;
  // What the items still to order cost at the rate each last went for (with its GST), for those that have a last order.
  const lastLines = request.items.filter((i) => toNumber(i.toOrderQty) > 0).map((i) => ({ i, r: last.data?.[lastRateKey(i.itemName, i.unit)]?.[0] }));
  const priced = lastLines.filter((x) => x.r);
  const atLast = priced.reduce((t, { i, r }) => t + toNumber(i.toOrderQty) * toNumber(r!.rate) * (1 + toNumber(r!.gstRate) / 100), 0);
  const l1Same = l1 && byId.get(l1.quotationId);
  const l1OnPriced = l1Same
    ? priced.reduce((t, { i }) => {
        const l = l1Same.lines.find((x) => x.materialRequestItemId === i.id);
        return t + (l ? toNumber(i.toOrderQty) * toNumber(l.rate) * (1 + toNumber(l.gstRate) / 100) : 0);
      }, 0)
    : 0;
  const pct = (a: number, b: number) => (b ? `${(((a - b) / b) * 100).toFixed(1)}%` : '');

  const pick = async (body: { quotationId?: string; split?: boolean; reason?: string | null }, what: string) => {
    await finalise.mutateAsync(body);
    message.success(`Finalised: ${what}. Make the purchase order next.`);
    onNext();
  };

  if (!quotes.length)
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quotations to compare yet. Send an enquiry or record a quotation first." />;

  return (
    <>
      {row.final ? (
        <Flex
          align="center"
          justify="space-between"
          wrap
          gap={token.marginSM}
          style={{ padding: token.paddingSM, marginBottom: token.margin, background: token.colorSuccessBg, borderRadius: token.borderRadius }}
        >
          <Flex align="center" gap={token.marginXS}>
            <CheckCircleOutlined style={{ color: token.colorSuccessText }} aria-hidden />
            <Typography.Text>
              <strong>Finalised: {row.final.split ? 'L1 per item, over more than one vendor' : <span translate="no">{row.final.vendorName ?? 'a quotation since deleted'}</span>}</strong>
              {row.final.rank ? ` (${rankLabel(row.final.rank)} when chosen)` : ''}
              {row.final.byName ? `, by ${row.final.byName}` : ''}
              {row.final.at ? ` on ${formatDateTime(row.final.at)}` : ''}.{row.final.reason ? ` Why: ${row.final.reason}` : ''}
            </Typography.Text>
          </Flex>
          {buyer ? (
            <Space wrap>
              <Button loading={reopen.isPending} onClick={() => reopen.mutate()}>
                Reopen
              </Button>
              <Button type="primary" icon={<ShoppingCartOutlined />} onClick={onNext}>
                Go to the purchase order
              </Button>
            </Space>
          ) : null}
        </Flex>
      ) : null}

      <Row gutter={[token.margin, token.margin]} style={{ marginBottom: token.margin }}>
        <Col xs={12} lg={6}>
          <Statistic title="L1 for what is left" value={l1 ? formatINR(l1.total) : 'No complete quotation'} valueRender={(v) => <span translate="no">{v}</span>} />
          <Muted>{l1 ? <span translate="no">{l1.vendorName}</span> : 'Every quotation leaves out an item'}</Muted>
        </Col>
        <Col xs={12} lg={6}>
          <Statistic title="L2 is higher by" value={l1 && l2 ? formatINR(l2.total - l1.total) : NO_VALUE} valueRender={(v) => <span translate="no">{v}</span>} />
          <Muted>{l1 && l2 ? <><span translate="no">{l2.vendorName}</span>, {pct(l2.total, l1.total)} more</> : 'Only one complete quotation'}</Muted>
        </Col>
        <Col xs={12} lg={6}>
          <Statistic title="L1 per item" value={split ? formatINR(split.total) : NO_VALUE} valueRender={(v) => <span translate="no">{v}</span>} />
          <Muted>
            {split
              ? l1
                ? split.total < l1.total
                  ? `${formatINR(l1.total - split.total)} less than L1, over ${split.orders.length} orders`
                  : `${formatINR(split.total - l1.total)} more than L1: freight is paid ${split.orders.length} times`
                : `${split.orders.length} orders`
              : 'One vendor is lowest on every item'}
          </Muted>
        </Col>
        <Col xs={12} lg={6}>
          <Statistic title="Against the last orders" value={priced.length && l1Same ? formatINR(l1OnPriced - atLast) : NO_VALUE} valueRender={(v) => <span translate="no">{v}</span>} />
          <Muted>
            {priced.length && l1Same
              ? `L1 is ${l1OnPriced >= atLast ? 'above' : 'below'} the last rates on ${priced.length} of ${lastLines.length} item${lastLines.length === 1 ? '' : 's'} (${pct(l1OnPriced, atLast)})`
              : last.isLoading
                ? 'Looking up the last orders…'
                : 'No earlier order of these items'}
          </Muted>
        </Col>
      </Row>

      <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
        <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
          Ranking for what is still to order
        </Typography.Title>
        {/* On a phone the table scrolls sideways, so its Finalise L1 is also here, in reach. */}
        {buyer && l1 && !screens.md ? (
          <Button type="primary" icon={<TrophyOutlined />} loading={finalise.isPending} onClick={() => pick({ quotationId: l1.quotationId }, `${l1.vendorName} (L1)`)}>
            Finalise L1: <span translate="no">{l1.vendorName}</span>
          </Button>
        ) : null}
      </Flex>
      <Table<RankedQuote>
        size="small"
        rowKey="quotationId"
        pagination={false}
        dataSource={ranked}
        scroll={{ x: 920 }}
        style={{ marginBottom: token.marginLG }}
        columns={[
          { title: 'Rank', key: 'rank', width: 80, render: (_, x) => (x.rank ? <AppTag tone={x.rank === 1 ? 'success' : 'neutral'} style={{ margin: 0 }}>{rankLabel(x.rank)}</AppTag> : <span className="text-muted">Part quotation</span>) },
          {
            title: 'Vendor',
            key: 'vendor',
            render: (_, x) => (
              <div>
                <span translate="no">{x.vendorName}</span>
                {x.missing ? <Muted>Leaves out {x.missing} item{x.missing === 1 ? '' : 's'} still to order</Muted> : null}
              </div>
            ),
          },
          { title: 'Total with GST and freight', key: 'total', width: 180, align: 'right', render: (_, x) => <strong className="mono" translate="no">{formatINR(x.total, true)}</strong> },
          {
            title: 'Above L1',
            key: 'gap',
            width: 150,
            align: 'right',
            render: (_, x) => (l1 && x.rank && x.rank > 1 ? <span translate="no">{formatINR(x.total - l1.total)}<Muted>{pct(x.total, l1.total)}</Muted></span> : <span className="text-muted">{NO_VALUE}</span>),
          },
          { title: 'Delivery', key: 'days', width: 100, align: 'right', render: (_, x) => { const d = byId.get(x.quotationId)?.deliveryDays; return d != null ? `${d} days` : <span className="text-muted">{NO_VALUE}</span>; } },
          { title: 'Payment', key: 'terms', width: 150, ellipsis: true, render: (_, x) => byId.get(x.quotationId)?.paymentTerms ?? <span className="text-muted">{NO_VALUE}</span> },
          ...(buyer
            ? [
                {
                  title: '',
                  key: 'pick',
                  width: 150,
                  render: (_: unknown, x: RankedQuote) =>
                    x.rank === 1 ? (
                      <Button type="primary" size="small" icon={<TrophyOutlined />} loading={finalise.isPending} onClick={() => pick({ quotationId: x.quotationId }, `${x.vendorName} (L1)`)}>
                        Finalise L1
                      </Button>
                    ) : (
                      <Button size="small" onClick={() => setChoosing(x)}>
                        Choose instead
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />
      {split && buyer ? (
        <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginLG }}>
          <Typography.Text type="secondary">
            Taking L1 per item gives {split.orders.length} orders ({split.orders.map((o) => o.vendorName).join(', ')}) for {formatINR(split.total)}.
          </Typography.Text>
          <Button loading={finalise.isPending} onClick={() => pick({ split: true }, 'L1 per item')}>
            Finalise L1 per item
          </Button>
        </Flex>
      ) : null}

      <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: `0 0 ${token.marginSM}px` }}>
        Comparative statement
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Rates item by item
      </Typography.Paragraph>
      {cs ? <ComparativeTable request={request} data={cs} /> : null}
      <ChooseInsteadModal
        choice={choosing}
        ranked={ranked}
        onClose={() => setChoosing(null)}
        onSubmit={async (reason) => {
          await pick({ quotationId: choosing!.quotationId, reason }, choosing!.vendorName);
        }}
      />
    </>
  );
}

/** Finalising a quotation other than L1 asks why; the reason goes on the order as why this vendor. */
function ChooseInsteadModal({ choice, ranked, onClose, onSubmit }: { choice: RankedQuote | null; ranked: RankedQuote[]; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [form] = Form.useForm<{ reason: string }>();
  return (
    <FormShell
      open={!!choice}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      title={choice ? `Finalise ${choice.vendorName}${choice.rank ? ` (${rankLabel(choice.rank)})` : ''}` : 'Finalise'}
      okText="Finalise"
      onSubmit={async (v) => {
        await onSubmit(v.reason.trim());
        return v;
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="Why this vendor"
          rules={[
            {
              validator: async (_, v: string | undefined) => {
                const problem = choice ? finaliseProblem(ranked, { quotationId: choice.quotationId }, v) : null;
                if (problem) throw new Error(problem);
              },
            },
          ]}
          extra="It goes on the purchase order, where the approver reads it."
        >
          <Input.TextArea rows={3} maxLength={500} placeholder="Faster delivery, better credit terms, brand the client approved…" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/* ---------- 4. Purchase order ---------- */

function OrdersStep({ request, row, cs, buyer, onFinalise }: { request: MaterialRequestDto; row: RequestToOrderDto; cs: ComparativeStatementDto | undefined; buyer: boolean; onFinalise: () => void }) {
  const { token } = theme.useToken();
  const [start, setStart] = useState<PoStart | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [openPo, setOpenPo] = useState<string | null>(null);
  const finalQuote = row.final && !row.final.split ? cs?.quotations.find((q) => q.id === row.final!.quotationId) : null;
  const left = row.itemsLeft > 0;
  return (
    <>
      <Flex justify="space-between" align="center" wrap gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
        <Typography.Text type="secondary">
          {!left
            ? 'Everything on this request is ordered or received.'
            : row.stage === 'READY'
              ? row.final!.split
                ? 'L1 per item is finalised: one draft order per vendor, each for the items it quoted lowest.'
                : `${row.final!.vendorName} is finalised. The order starts from their quotation for what is still to order.`
              : 'Finalise L1 first, so the order is made on the vendor you chose.'}
        </Typography.Text>
        {buyer && left ? (
          <Space wrap>
            {row.stage === 'READY' && row.final?.split && cs ? (
              <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => setAwarding(true)}>
                Make the draft orders
              </Button>
            ) : row.stage === 'READY' && finalQuote ? (
              <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => setStart(poStartFrom(request, finalQuote, row.final?.reason))}>
                New purchase order on {finalQuote.vendorName}
              </Button>
            ) : (
              <Button type="primary" onClick={onFinalise}>
                Go to Finalise L1
              </Button>
            )}
            <Button onClick={() => setStart(poStartFrom(request, null))}>New purchase order without a quotation</Button>
          </Space>
        ) : null}
      </Flex>
      <RequestOrders requestId={request.id} onOpen={setOpenPo} />
      {cs ? <AwardLowestModal open={awarding} onClose={() => setAwarding(false)} request={request} comparative={cs} onRaised={(o) => setOpenPo(o[0]?.id ?? null)} /> : null}
      <PurchaseOrderFormModal open={!!start} start={start} onClose={() => setStart(null)} onSaved={(o) => setOpenPo(o.id)} />
      <PurchaseOrderDrawer id={openPo} open={!!openPo} onClose={() => setOpenPo(null)} />
    </>
  );
}
