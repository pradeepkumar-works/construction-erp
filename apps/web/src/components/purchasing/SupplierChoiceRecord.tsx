'use client';

import React from 'react';
import Link from 'next/link';
import { Table, Typography } from 'antd';
import type { RankedQuote } from '@erp/shared';
import { rankLabel } from '@erp/shared';
import { useSupplierChoice } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { StatusTag } from '@/components/common/StatusTag';
import { ReviewActions } from '@/components/common/ReviewActions';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
}

const money = (v: string | number, strong?: boolean) =>
  strong ? (
    <strong className="mono" translate="no">
      {formatINR(v, true)}
    </strong>
  ) : (
    <span className="mono" translate="no">
      {formatINR(v, true)}
    </span>
  );

/**
 * A supplier choice: the supplier purchase finalised on a material request (Finalise L1), sent for approval when the
 * company has orders wait for an approved choice. The approver sees what was chosen against L1, why, and every quotation
 * as it ranks now; once approved, purchase raises the order on it from Requests to order. In a drawer, the approvals pane
 * or at `/supplier-choices/<id>`.
 */
export function SupplierChoiceRecord({ id, mode, open, onClose }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useSupplierChoice(id ?? undefined);
  const chosen = data ? (data.split ? 'L1 per item, over more than one vendor' : (data.vendorName ?? 'A quotation since deleted')) : '';
  const above = data && data.l1Amount !== null ? toNumber(data.amount) - toNumber(data.l1Amount) : 0;

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={760}
      kind="Supplier choice"
      list={{ href: '/requests-to-order', label: 'Requests to order' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/supplier-choices/${data.id}`,
          title: (
            <span>
              <span translate="no">{data.requestNo}</span> · <span translate="no">{chosen}</span>
            </span>
          ),
          tags: (
            <>
              <StatusTag status={data.status} />{' '}
              {data.rank ? (
                <AppTag tone={data.rank === 1 ? 'success' : 'pending'} style={{ margin: 0 }}>
                  {rankLabel(data.rank)}
                </AppTag>
              ) : null}{' '}
              {!data.current ? <AppTag style={{ margin: 0 }}>Replaced</AppTag> : null}
            </>
          ),
          notices: !data.current ? (
            <Typography.Paragraph type="secondary">Purchase has since finalised {data.requestNo} again or reopened it, so this choice no longer stands.</Typography.Paragraph>
          ) : null,
          facts: [
            {
              key: 'request',
              label: 'Indent',
              children: (
                <Link href={`/requests-to-order/${data.materialRequestId}`} className="mono" translate="no">
                  {data.requestNo}
                </Link>
              ),
            },
            { key: 'chosen', label: 'Vendor', children: <span translate="no">{chosen}</span> },
            { key: 'amount', label: 'Value of the order', children: money(data.amount, true) },
            {
              key: 'l1',
              label: 'Against L1',
              children:
                data.l1Amount === null ? (
                  <span className="text-muted">No quotation priced every item</span>
                ) : above > 0 ? (
                  <span>
                    {money(above)} more than L1 ({money(data.l1Amount)})
                  </span>
                ) : (
                  <span>{data.split && above < 0 ? <>{money(-above)} less than L1 ({money(data.l1Amount)})</> : 'Is L1'}</span>
                ),
            },
            {
              key: 'items',
              label: 'Still to order',
              children: `${data.itemsLeft} item${data.itemsLeft === 1 ? '' : 's'}${data.itemNames.length ? `: ${data.itemNames.join(', ')}${data.itemsLeft > data.itemNames.length ? '…' : ''}` : ''}`,
            },
            ...(data.reason ? [{ key: 'reason', label: 'Why this vendor', span: 2, children: <span style={{ whiteSpace: 'pre-wrap' }}>{data.reason}</span> }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data, [{ title: 'Order made', done: data.status === 'APPROVED' && data.itemsLeft === 0, content: data.status === 'APPROVED' ? (data.itemsLeft ? 'Purchase makes it' : 'Everything ordered') : undefined }]),
          sections: [
            ...(data.split
              ? [
                  {
                    key: 'split',
                    title: 'Orders, L1 per item',
                    count: data.splitVendors.length,
                    children: (
                      <Table
                        size="small"
                        rowKey="vendorName"
                        pagination={false}
                        dataSource={data.splitVendors}
                        scroll={{ x: 420 }}
                        columns={[
                          { title: 'Vendor', dataIndex: 'vendorName', render: (v: string) => <span translate="no">{v}</span> },
                          { title: 'Items', dataIndex: 'items', width: 90, align: 'right' },
                          { title: 'Total with GST and freight', dataIndex: 'total', width: 200, align: 'right', render: (v: number) => money(v, true) },
                        ]}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'ranking',
              title: 'Quotations as they rank now',
              count: data.ranking.length,
              children: (
                <Table<RankedQuote>
                  size="small"
                  rowKey="quotationId"
                  pagination={false}
                  dataSource={data.ranking}
                  scroll={{ x: 560 }}
                  columns={[
                    {
                      title: 'Rank',
                      key: 'rank',
                      width: 90,
                      render: (_, x) => (x.rank ? <AppTag tone={x.rank === 1 ? 'success' : 'neutral'} style={{ margin: 0 }}>{rankLabel(x.rank)}</AppTag> : <span className="text-muted">Part quote</span>),
                    },
                    {
                      title: 'Vendor',
                      key: 'vendor',
                      render: (_, x) => (
                        <span>
                          <span translate="no">{x.vendorName}</span>
                          {x.quotationId === data.quotationId ? <AppTag tone="info" style={{ marginLeft: 8 }}>Chosen</AppTag> : null}
                          {x.missing ? <div className="text-muted">Leaves out {x.missing} item{x.missing === 1 ? '' : 's'}</div> : null}
                        </span>
                      ),
                    },
                    { title: 'Total with GST and freight', key: 'total', width: 200, align: 'right', render: (_, x) => money(x.total, true) },
                  ]}
                />
              ),
            },
          ],
          activity: { type: 'supplier_choice', id: data.id, submission: data },
          actions: (size) => <ReviewActions type="supplier_choice" id={data.id} status={data.status} amount={data.amount} size={size} />,
        }
      }
    />
  );
}

export function SupplierChoiceDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <SupplierChoiceRecord mode="drawer" {...props} />;
}
