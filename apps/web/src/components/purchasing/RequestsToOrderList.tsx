'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select, Typography, theme } from 'antd';
import type { OrderStage, RequestToOrderDto } from '@erp/shared';
import { ORDER_STAGES, ORDER_STAGE_LABELS, rankLabel } from '@erp/shared';
import { useRequestsToOrder } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import dayjs from 'dayjs';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { PriorityTag } from '@/components/common/StatusTag';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';

const KEYS = ['stage'] as const;

/** A stage's tone: what waits on purchase is pending, the order to raise is the call to act. */
export const STAGE_TONE: Record<OrderStage, 'neutral' | 'info' | 'pending' | 'success'> = {
  TO_ENQUIRE: 'neutral',
  AWAITING_QUOTES: 'info',
  TO_FINALISE: 'pending',
  READY: 'success',
};

export function StageTag({ stage }: { stage: OrderStage }) {
  return (
    <AppTag tone={STAGE_TONE[stage]} dot style={{ margin: 0 }}>
      {ORDER_STAGE_LABELS[stage]}
    </AppTag>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

/** The days a request is late (positive) or still has (negative) against the day it is needed. */
const lateBy = (requiredDate: string) => dayjs().startOf('day').diff(dayjs(requiredDate), 'day');

/** What the stage waits on, in a line: who answered the enquiry, what is not quoted, who was finalised. */
export function stageNote(r: RequestToOrderDto): string | null {
  if (r.stage === 'AWAITING_QUOTES' && r.enquiry) return `${r.enquiry.replied} of ${r.enquiry.invited} replied, closes ${formatDate(r.enquiry.closesOn)}`;
  if (r.stage === 'READY' && r.final) return r.final.split ? 'Lowest per item, split between vendors' : `${r.final.vendorName ?? 'Quotation'}${r.final.rank ? ` (${rankLabel(r.final.rank)})` : ''}`;
  if (r.itemsUnquoted > 0 && r.quotations > 0) return `${r.itemsUnquoted} item${r.itemsUnquoted === 1 ? '' : 's'} nobody quoted`;
  if (r.stage === 'TO_ENQUIRE') return 'Send an enquiry or record a quotation';
  return null;
}

function columns(showProject: boolean): ListColumn<RequestToOrderDto>[] {
  return [
    {
      key: 'request',
      card: 'title',
      cardText: (r) => r.requestNo,
      title: 'Request',
      locked: true,
      width: 150,
      render: (_, r) => (
        <div>
          <Link href={`/requests-to-order/${r.id}`} className="mono" style={{ fontWeight: 600 }}>
            {r.requestNo}
          </Link>
          <Sub>by {r.submittedByName}</Sub>
        </div>
      ),
    },
    ...(showProject ? [{ key: 'project', card: 'meta' as const, cardText: (r: RequestToOrderDto) => r.projectName, title: 'Project', dataIndex: 'projectName', width: 180, ellipsis: true }] : []),
    {
      key: 'items',
      title: 'Still to order',
      render: (_, r) => (
        <div>
          {r.itemNames.join(', ')}
          {r.itemsLeft > r.itemNames.length ? ` and ${r.itemsLeft - r.itemNames.length} more` : ''}
          {r.orders > 0 ? <Sub>{r.orders} order{r.orders === 1 ? '' : 's'} raised already</Sub> : null}
        </div>
      ),
    },
    {
      key: 'needed',
      card: 'date',
      cardText: (r) => formatDate(r.requiredDate),
      title: 'Needed by',
      width: 130,
      render: (_, r) => {
        const late = lateBy(r.requiredDate);
        return (
          <div>
            {formatDate(r.requiredDate)}
            <Sub>
              {late > 0 ? <Typography.Text type="danger" style={{ fontSize: 'inherit' }}>{late} day{late === 1 ? '' : 's'} late</Typography.Text> : late === 0 ? 'Today' : `In ${-late} day${late === -1 ? '' : 's'}`}
              {r.priority !== 'NORMAL' ? <> · <PriorityTag priority={r.priority} /></> : null}
            </Sub>
          </div>
        );
      },
    },
    {
      key: 'stage',
      card: 'status',
      title: 'Stage',
      width: 220,
      render: (_, r) => (
        <div>
          <StageTag stage={r.stage} />
          {stageNote(r) ? <Sub>{stageNote(r)}</Sub> : null}
        </div>
      ),
    },
    {
      key: 'l1',
      card: 'amount',
      title: 'L1',
      width: 170,
      align: 'right',
      render: (_, r) =>
        r.l1 ? (
          <div>
            <strong className="mono" translate="no">{formatINR(r.l1.total, true)}</strong>
            <Sub><span translate="no">{r.l1.vendorName}</span></Sub>
          </div>
        ) : (
          <span className="text-muted">{r.quotations ? 'No complete quote' : 'No quotes'}</span>
        ),
    },
    {
      key: 'l2',
      defaultFrom: 1600,
      title: 'L2',
      width: 170,
      align: 'right',
      render: (_, r) =>
        r.l2 ? (
          <div>
            <span className="mono" translate="no">{formatINR(r.l2.total, true)}</span>
            <Sub><span translate="no">{r.l2.vendorName}</span></Sub>
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    { key: 'quotes', defaultFrom: 1800, title: 'Quotes', dataIndex: 'quotations', width: 90, align: 'right' },
  ];
}

/**
 * Purchase's own list (Purchases › Requests to order): every approved material request with something still to order,
 * by the day it is needed, at its stage. A row opens the request's buying screen (enquiry, quotations, Finalise L1,
 * order), so purchase never goes into Materials to find them.
 */
export function RequestsToOrderList() {
  const router = useRouter();
  const frame = useListFrame({
    list: 'requests-to-order',
    keys: KEYS,
    sortBy: 'requiredDate',
    sortOrder: 'asc',
    sortFields: ['requiredDate'] as const,
    columns: () => columns(true),
    moreViews: ORDER_STAGES.map((s) => ({ key: s, label: ORDER_STAGE_LABELS[s], filters: { stage: s } })),
    chipLabels: { stage: (v) => `Stage: ${ORDER_STAGE_LABELS[v as OrderStage] ?? v}` },
  });
  const { page } = frame;
  const stage = ORDER_STAGES.includes(page.filters.stage as OrderStage) ? (page.filters.stage as OrderStage) : undefined;
  const { data, isLoading, isFetching, error, refetch } = useRequestsToOrder({ page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, projectId: frame.projectId, stage });
  const counts = data?.stages;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search request no., item, project, supplier"
        searchLabel="Search requests to order"
      >
        <Select
          allowClear
          aria-label="Stage"
          placeholder="Any stage"
          style={{ width: 240 }}
          value={stage}
          onChange={(v) => page.setFilter('stage', v)}
          options={ORDER_STAGES.map((s) => ({ value: s, label: counts ? `${ORDER_STAGE_LABELS[s]}: ${counts[s]}` : ORDER_STAGE_LABELS[s] }))}
        />
      </ListToolbar>
      <DataTable<RequestToOrderDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RequestToOrderDto>(data?.total)}
        onOpen={(id) => router.push(`/requests-to-order/${id}`)}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1100}
        emptyText={<EmptyArt art="approved" title={stage ? `Nothing at ${ORDER_STAGE_LABELS[stage].toLowerCase()}` : 'Nothing to order. Approved material requests show here until everything on them is ordered.'} />}
      />
    </>
  );
}
