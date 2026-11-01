'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Button, Card, Col, Descriptions, Dropdown, Flex, Grid, Row, Space, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MenuProps, TableColumnType } from 'antd';
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, RollbackOutlined, StopOutlined, TrophyOutlined } from '@/components/common/icons';
import { type ScEnquiryDetailDto, type ScEnquiryItemDto, type ScQuoteDto } from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useScEnquiry, useScEnquiryAction } from '@/lib/queries';
import { formatDate, formatINR, toNumber, NO_VALUE, formatQty } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { LinkButton } from '@/components/common/LinkButton';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { RankTag } from '@/components/tenders/tenderUi';
import { AwardDialog, CancelDialog, InviteDialog, QuoteDrawer, ScEnquiryForm, ScEnquiryStatusTag } from '@/components/sc-enquiries/ScEnquiryForms';

const money = (v: string | null | undefined, paise = true) => <span translate="no">{v === null || v === undefined ? NO_VALUE : formatINR(v, paise)}</span>;
const pct = (v: string | null) => (v === null ? null : `${Math.abs(toNumber(v)).toFixed(2)}% ${toNumber(v) < 0 ? 'over' : 'under'}`);
const qty = (v: string) => formatQty(v);

/**
 * One subcontract enquiry: the comparative statement (each item's rate from every quote received, the
 * lowest marked, the spread between them, the totals ranked L1, L2… and each against the client's rates), the
 * subcontractors asked and their quotes, and the award that makes the chosen quote a work order.
 */
export default function ScEnquiryPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useScEnquiry(params?.id);
  if (isLoading)
    return (
      <div className="page-container">
        <PageSkeleton shape="record" />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-container">
        <QueryError error={error ?? new Error('Enquiry not found')} onRetry={() => refetch()} />
      </div>
    );
  return <EnquiryView e={data} />;
}

function EnquiryView({ e }: { e: ScEnquiryDetailDto }) {
  const { token } = theme.useToken();
  const { modal } = App.useApp();
  const router = useRouter();
  const notify = useNotify();
  const act = useScEnquiryAction();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [awarding, setAwarding] = useState<{ quoteId: string | null } | null>(null);
  const [quote, setQuote] = useState<ScQuoteDto | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();

  const isOpen = e.status === 'OPEN';
  const edit = e.canEdit;
  const received = e.quotes.filter((q) => q.received);
  const awaited = e.quotes.filter((q) => !q.received);
  const awardable = received.filter((q) => q.complete);
  const lowest = awardable.find((q) => q.rank === 1);
  const awarded = e.quotes.find((q) => q.awarded);
  // Awarded, but its work order was deleted: it can be awarded again or reopened.
  const orphaned = e.status === 'AWARDED' && !e.workOrderId;

  const reopen = () =>
    modal.confirm({
      title: `Reopen ${e.enquiryNo}?`,
      content: 'It goes back to open: quotes can be entered and changed, and it can be awarded again.',
      okText: 'Reopen',
      onOk: async () => {
        await act.mutateAsync({ path: `/subcontract-enquiries/${e.id}/status`, body: { status: 'OPEN' } });
        notify.saved(`${e.enquiryNo} reopened`);
      },
    });
  const more: MenuProps['items'] = edit
    ? [
        ...(isOpen ? [{ key: 'cancel', icon: <StopOutlined />, label: 'Cancel enquiry', onClick: () => setCancelling(true) }] : []),
        ...(e.status === 'CANCELLED' || orphaned ? [{ key: 'reopen', icon: <RollbackOutlined />, label: 'Reopen', onClick: reopen }] : []),
        ...(!e.workOrderId
          ? [
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                danger: true,
                label: 'Delete enquiry',
                onClick: () =>
                  askDelete({
                    what: `enquiry ${e.enquiryNo}`,
                    description: received.length ? `The ${received.length === 1 ? 'quote' : `${received.length} quotes`} entered on it go with it.` : undefined,
                    onConfirm: () => act.mutateAsync({ method: 'delete', path: `/subcontract-enquiries/${e.id}` }),
                    onDone: () => router.push('/subcontract-enquiries'),
                  }),
              },
            ]
          : []),
      ]
    : [];

  const actions = (
    <Space wrap>
      {edit && (isOpen || orphaned) && awardable.length ? (
        <Button type="primary" icon={<TrophyOutlined />} onClick={() => setAwarding({ quoteId: null })}>
          {orphaned ? 'Award again' : 'Award'}
        </Button>
      ) : null}
      {e.workOrderId ? <LinkButton href={`/work-orders/${e.workOrderId}`}>{`Open work order ${e.woNo ?? ''}`}</LinkButton> : null}
      {edit && isOpen ? (
        <Button icon={<PlusOutlined />} onClick={() => setInviting(true)}>
          Ask to quote
        </Button>
      ) : null}
      {edit && isOpen ? (
        <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
          Edit
        </Button>
      ) : null}
      {more.length ? (
        <Dropdown menu={{ items: more }} trigger={['click']}>
          <Button icon={<MoreOutlined />} aria-label="More actions" />
        </Dropdown>
      ) : null}
    </Space>
  );

  const stat = (title: string, value: React.ReactNode, note?: React.ReactNode) => (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={0} formatter={() => value} styles={{ content: { fontSize: token.fontSizeHeading4 } }} />
        {note ? <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{note}</div> : null}
      </Card>
    </Col>
  );
  const lead = awarded ?? lowest;

  return (
    <div className="page-container">
      <PageHeader
        title={<span translate="no">{e.title}</span>}
        docTitle={`Enquiry ${e.enquiryNo}`}
        crumbs={[{ title: 'Subcontract enquiries', href: '/subcontract-enquiries' }, { title: e.enquiryNo }]}
        subtitle={
          <span>
            <ScEnquiryStatusTag status={e.status} />
            {isOpen && e.closed ? <AppTag tone="pending">Past its last day</AppTag> : null}
            <span translate="no">{`${e.enquiryNo} · ${e.projectCode} ${e.projectName}`}</span>
          </span>
        }
        extra={actions}
      />
      <Row gutter={[12, 12]} style={{ marginBottom: token.marginMD }}>
        {stat('Quotes in', `${received.length} of ${e.quotes.length}`, awaited.length ? `Awaited: ${awaited.map((q) => q.vendorName).join(', ')}` : e.quotes.length ? 'All in' : 'Ask subcontractors to quote')}
        {stat(
          awarded ? 'Awarded' : 'Lowest quote',
          money(lead?.total ?? null),
          lead ? (
            <span translate="no">{`${lead.vendorName}, + GST ${toNumber(lead.gstRate)}%`}</span>
          ) : received.length ? (
            'No quote prices every item yet'
          ) : (
            'No quote in yet'
          ),
        )}
        {stat(
          "Client's rates",
          money(e.clientValue),
          e.clientValue ? (lead?.marginPct ? `${awarded ? 'Awarded' : 'Lowest'} is ${pct(lead.marginPct)} them` : 'The BOQ items asked, at the client’s rates') : 'Only own items: no client rate',
        )}
        {stat(
          'Last day to quote',
          e.closesOn ? <span translate="no">{formatDate(e.closesOn)}</span> : NO_VALUE,
          e.decidedAt ? <span translate="no">{`${e.status === 'CANCELLED' ? 'Cancelled' : 'Awarded'} on ${formatDate(e.decidedAt)}`}</span> : isOpen ? (e.closed ? 'Quotes can still be entered' : 'Open for quotes') : null,
        )}
      </Row>
      <Comparison e={e} onQuote={setQuote} onAward={edit && (isOpen || orphaned) ? (id) => setAwarding({ quoteId: id }) : undefined} />
      <Row gutter={[16, 16]} style={{ marginTop: token.marginMD }}>
        <Col xs={24} lg={14}>
          <QuotesCard
            e={e}
            onEnter={edit && isOpen ? setQuote : undefined}
            onRemove={
              edit && isOpen
                ? (q) =>
                    askDelete({
                      what: q.received ? `the quote from ${q.vendorName}` : q.vendorName,
                      verb: 'Remove',
                      description: q.received ? 'Their rates leave the comparison.' : 'They are no longer asked to quote.',
                      onConfirm: () => act.mutateAsync({ method: 'delete', path: `/subcontract-enquiries/${e.id}/quotes/${q.id}` }),
                    })
                : undefined
            }
          />
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={<CardTitle>Details</CardTitle>}>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: 'project', label: 'Project', children: <span translate="no">{`${e.projectCode} ${e.projectName}`}</span> },
                { key: 'scope', label: 'The rates include', children: e.scope ? <span style={{ whiteSpace: 'pre-wrap' }}>{e.scope}</span> : NO_VALUE },
                ...(e.decisionNote ? [{ key: 'note', label: e.status === 'CANCELLED' ? 'Why cancelled' : 'Why this quote', children: e.decisionNote }] : []),
                { key: 'by', label: 'Created', children: <span translate="no">{`${e.createdByName}, ${formatDate(e.createdAt)}`}</span> },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <ScEnquiryForm open={editing} enquiry={e} onClose={() => setEditing(false)} />
      <InviteDialog enquiry={e} open={inviting} onClose={() => setInviting(false)} />
      <CancelDialog enquiry={e} open={cancelling} onClose={() => setCancelling(false)} />
      <AwardDialog enquiry={e} open={!!awarding} quoteId={awarding?.quoteId} onClose={() => setAwarding(null)} />
      <QuoteDrawer enquiry={e} quote={quote} onClose={() => setQuote(null)} />
      {deleteDialog}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>
      {children}
    </Typography.Title>
  );
}

type CmpRow = { key: string; item?: ScEnquiryItemDto; total?: 'total' | 'gst' | 'withGst' | 'margin' };

/**
 * The comparative statement: one row per item with its quantity and the client's rate, one column per quote received
 * (L1 first), the lowest rate of each item in bold on a green ground, and the totals, GST and margin below.
 */
function Comparison({ e, onQuote, onAward }: { e: ScEnquiryDetailDto; onQuote: (q: ScQuoteDto) => void; onAward?: (quoteId: string) => void }) {
  const { token } = theme.useToken();
  // On a phone the item column is narrow and scrolls with the rest, so the rates stay in view.
  const wide = !!Grid.useBreakpoint().md;
  const itemWidth = wide ? 300 : 170;
  const quotes = e.quotes.filter((q) => q.received);
  const small = { display: 'block', fontSize: token.fontSizeSM } as const;
  const rows: CmpRow[] = [
    ...e.items.map((item) => ({ key: item.id, item })),
    ...(quotes.length
      ? ([
          { key: 'total', total: 'total' },
          { key: 'gst', total: 'gst' },
          { key: 'withGst', total: 'withGst' },
          ...(e.clientValue ? [{ key: 'margin', total: 'margin' }] : []),
        ] as CmpRow[])
      : []),
  ];
  const label: Record<NonNullable<CmpRow['total']>, string> = { total: 'Total before GST', gst: 'GST', withGst: 'Total with GST', margin: "Against the client's rates" };

  const quoteCol = (q: ScQuoteDto): TableColumnType<CmpRow> => ({
    key: q.id,
    width: 190,
    align: 'right',
    title: (
      <div style={{ textAlign: 'right' }}>
        <div translate="no">{q.vendorName}</div>
        <Flex gap={4} justify="flex-end" wrap>
          {q.rank ? <RankTag rank={q.rank} /> : <AppTag>{q.complete ? NO_VALUE : `${q.priced} of ${e.items.length} priced`}</AppTag>}
          {q.awarded ? <AppTag tone="success">Awarded</AppTag> : null}
        </Flex>
        <Space size={0} style={{ marginTop: 4 }}>
          {e.status === 'OPEN' && e.canEdit ? (
            <Button size="small" type="link" onClick={() => onQuote(q)} aria-label={`Edit quote from ${q.vendorName}`}>
              Edit
            </Button>
          ) : null}
          {onAward && q.complete ? (
            <Button size="small" type="link" onClick={() => onAward(q.id)} aria-label={`Award to ${q.vendorName}`}>
              Award
            </Button>
          ) : null}
        </Space>
      </div>
    ),
    render: (_, r) => {
      if (r.item) {
        const rate = q.rates[r.item.id];
        if (rate === null || rate === undefined) return <Typography.Text type="secondary">Not quoted</Typography.Text>;
        const low = r.item.lowestQuoteIds.includes(q.id) && quotes.length > 1;
        return (
          <div translate="no" style={low ? { background: token.colorSuccessBg, fontWeight: 600, borderRadius: token.borderRadiusSM, padding: '2px 6px', margin: '-2px -6px' } : undefined}>
            {formatINR(rate, true)}
            <Typography.Text type="secondary" style={{ ...small, fontWeight: 400 }}>
              {formatINR(toNumber(rate) * toNumber(r.item.quantity), true)}
            </Typography.Text>
          </div>
        );
      }
      if (r.total === 'total') return <strong>{money(q.total)}</strong>;
      if (r.total === 'gst') return <span>{money(q.gst)}<Typography.Text type="secondary" style={small}>{`at ${toNumber(q.gstRate)}%`}</Typography.Text></span>;
      if (r.total === 'withGst') return money(q.totalWithGst);
      return q.marginPct === null ? NO_VALUE : <Typography.Text type={toNumber(q.marginPct) < 0 ? 'danger' : undefined}>{pct(q.marginPct)}</Typography.Text>;
    },
  });

  const columns: TableColumnType<CmpRow>[] = [
    {
      key: 'item',
      title: 'Item',
      width: itemWidth,
      fixed: wide ? 'left' : undefined,
      render: (_, r) =>
        r.item ? (
          <div>
            {r.item.itemNo ? <span translate="no">{`${r.item.itemNo} `}</span> : null}
            {r.item.description}
            <Typography.Text type="secondary" style={small} translate="no">
              {`${qty(r.item.quantity)} ${r.item.unit}`}
            </Typography.Text>
          </div>
        ) : (
          <strong>{label[r.total!]}</strong>
        ),
    },
    {
      key: 'client',
      title: "Client's rate",
      width: 150,
      align: 'right',
      render: (_, r) =>
        r.item ? (
          r.item.clientRate ? (
            <div translate="no">
              {formatINR(r.item.clientRate, true)}
              {r.item.budgetRate ? <Typography.Text type="secondary" style={small}>{`Budget ${formatINR(r.item.budgetRate, true)}`}</Typography.Text> : null}
            </div>
          ) : (
            <Typography.Text type="secondary">Own item</Typography.Text>
          )
        ) : r.total === 'total' ? (
          money(e.clientValue)
        ) : null,
    },
    ...quotes.map(quoteCol),
    ...(quotes.length > 1
      ? [
          {
            key: 'spread',
            title: 'Spread',
            width: 100,
            align: 'right' as const,
            render: (_: unknown, r: CmpRow) => (r.item?.spreadPct ? <span translate="no">{`${toNumber(r.item.spreadPct).toFixed(1)}%`}</span> : null),
          },
        ]
      : []),
  ];

  return (
    <Card
      size="small"
      title={<CardTitle>Comparative statement</CardTitle>}
    >
      <Table<CmpRow>
        size="small"
        rowKey="key"
        pagination={false}
        columns={columns}
        dataSource={rows}
        scroll={{ x: itemWidth + 150 + quotes.length * 190 + (quotes.length > 1 ? 100 : 0) }}
      />
      {quotes.length > 1 ? (
        <Typography.Paragraph type="secondary" style={{ margin: `${token.marginSM}px 0 0`, fontSize: token.fontSizeSM }}>
          Bold on a green ground: the item&apos;s lowest rate. Spread: how far the highest rate is above the lowest.
        </Typography.Paragraph>
      ) : null}
      {!quotes.length ? (
        <Typography.Paragraph type="secondary" style={{ margin: `${token.marginSM}px 0 0` }}>
          {e.quotes.length ? 'No quote is in yet. Enter each one as it comes, from the quotes below.' : 'Nobody is asked to quote yet. Use Ask to quote to add subcontractors.'}
        </Typography.Paragraph>
      ) : null}
    </Card>
  );
}

/** Everyone asked: when their quote came and how long it holds, or that it is awaited, with their phone. */
function QuotesCard({ e, onEnter, onRemove }: { e: ScEnquiryDetailDto; onEnter?: (q: ScQuoteDto) => void; onRemove?: (q: ScQuoteDto) => void }) {
  const { token } = theme.useToken();
  return (
    <Card size="small" title={<CardTitle>{`Asked to quote (${e.quotes.length})`}</CardTitle>}>
      {e.quotes.length ? (
        <Flex vertical>
          {e.quotes.map((q, i) => (
            <Flex
              key={q.id}
              gap={12}
              align="center"
              justify="space-between"
              wrap
              style={{ minHeight: 44, padding: `${token.paddingXS}px 0`, borderTop: i ? `1px solid ${token.colorSplit}` : undefined }}
            >
              <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                <Typography.Text strong translate="no">
                  {q.vendorName}
                </Typography.Text>{' '}
                {q.rank ? <RankTag rank={q.rank} /> : null}
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                  {[
                    q.received ? `In on ${formatDate(q.receivedOn!)}` : 'Awaited',
                    q.received && !q.complete ? `${q.priced} of ${e.items.length} items priced` : null,
                    q.validUntil ? `valid till ${formatDate(q.validUntil)}` : null,
                    q.vendorPhone,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography.Text>
                {q.note ? <Typography.Text style={{ display: 'block', fontSize: token.fontSizeSM }}>{q.note}</Typography.Text> : null}
              </div>
              {onEnter || onRemove ? (
                <Space size={4}>
                  {onEnter ? (
                    <Button size="small" type={q.received ? 'default' : 'primary'} onClick={() => onEnter(q)} aria-label={`${q.received ? 'Edit quote' : 'Enter quote'} from ${q.vendorName}`}>
                      {q.received ? 'Edit quote' : 'Enter quote'}
                    </Button>
                  ) : null}
                  {onRemove ? <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => onRemove(q)} aria-label={`Remove ${q.vendorName}`} /> : null}
                </Space>
              ) : null}
            </Flex>
          ))}
        </Flex>
      ) : (
        <Typography.Text type="secondary">Nobody yet.</Typography.Text>
      )}
    </Card>
  );
}
