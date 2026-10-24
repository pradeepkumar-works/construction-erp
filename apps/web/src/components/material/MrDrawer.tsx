'use client';

import React, { useState } from 'react';
import { Button, Popover, Table, Typography } from 'antd';
import { ImportOutlined, InboxOutlined } from '@/components/common/icons';
import type { MaterialRequestDto, MaterialRequestItemDto, RequestLineStockDto } from '@erp/shared';
import { canKeepStock, canViewPurchaseOrders } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMaterialRequest, useRequestStock } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { PriorityTag, StatusTag } from '@/components/common/StatusTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { ReceiptModal } from '@/components/stock/ReceiptModal';
import { QuotationsPanel } from '@/components/purchasing/QuotationsPanel';
import { CoverFromStockModal } from './CoverFromStockModal';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: MaterialRequestDto) => void;
}

/** A material request, in a drawer from a list or as its own page at `/material-requests/<id>`. */
export function MrRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useMaterialRequest(id ?? undefined);
  const { user } = useAuth();
  const [receiving, setReceiving] = useState(false);
  const [covering, setCovering] = useState(false);
  const approved = data?.status === 'APPROVED';
  // Received and met from stock both count towards a line (v5 item 95).
  const got = (i: MaterialRequestItemDto) => Number(i.receivedQty) + Number(i.coveredQty);
  const pending = approved && !!data && data.items.some((i) => got(i) < Number(i.quantity));
  const mayReceive = pending && !!user && canKeepStock(user.roleKey);
  const purchasing = approved && !!user && canViewPurchaseOrders(user.roleKey);
  const receivedLines = data?.items.filter((i) => got(i) >= Number(i.quantity)).length ?? 0;
  const stock = useRequestStock(data?.id, approved);
  const stockOf = (id: string) => stock.data?.lines.find((l) => l.materialRequestItemId === id);
  const anyCovered = !!data?.items.some((i) => Number(i.coveredQty) > 0);
  const mayCover =
    !!stock.data &&
    stock.data.lines.some((l) => toNumber(l.toOrderQty) > 0 && ((stock.data!.canIssue && toNumber(l.here) > 0) || l.others.some((o) => o.canSend && toNumber(o.balance) > 0)));
  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={purchasing ? 960 : 680}
      kind="Material request"
      list={{ href: '/material-requests', label: 'Material requests' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/material-requests/${data.id}`,
          title: `Material request · ${data.requestNo}`,
          tags: <StatusTag status={data.status} />,
          facts: [
            { key: 'no', label: 'Request no.', children: data.requestNo },
            { key: 'priority', label: 'Priority', children: <PriorityTag priority={data.priority} /> },
            { key: 'req', label: 'Required by', children: formatDate(data.requiredDate) },
            { key: 'count', label: 'Line items', children: data.items.length },
            ...(data.remarks ? [{ key: 'remarks', label: 'Remarks', children: data.remarks }] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data, [{ title: 'Received', done: receivedLines === data.items.length, content: data.status === 'APPROVED' ? `${receivedLines} of ${data.items.length} lines` : undefined }]),
          sections: [
            {
              key: 'items',
              title: 'Items',
              count: data.items.length,
              children: (
                <Table<MaterialRequestItemDto>
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={data.items}
                  scroll={{ x: 640 }}
                  columns={[
                    { title: '#', key: 'idx', width: 40, render: (_, __, i) => i + 1 },
                    { title: 'Item', dataIndex: 'itemName' },
                    { title: 'Specification', dataIndex: 'specification', render: (v) => v ?? <span className="text-muted">-</span> },
                    { title: 'Qty', dataIndex: 'quantity', align: 'right', width: 90, render: (v) => formatQty(v) },
                    { title: 'Unit', dataIndex: 'unit', width: 80 },
                    ...(data.status === 'APPROVED'
                      ? [
                          {
                            title: 'Ordered',
                            dataIndex: 'orderedQty',
                            align: 'right' as const,
                            width: 100,
                            render: (v: string) => (Number(v) > 0 ? formatQty(v) : <span className="text-muted">0</span>),
                          },
                          {
                            title: 'In stock',
                            key: 'stock',
                            width: 150,
                            render: (_: unknown, i: MaterialRequestItemDto) => <StockCell line={stockOf(i.id)} loading={stock.isLoading} />,
                          },
                          ...(anyCovered
                            ? [
                                {
                                  title: 'From stock',
                                  dataIndex: 'coveredQty',
                                  align: 'right' as const,
                                  width: 100,
                                  render: (v: string) => (Number(v) > 0 ? formatQty(v) : <span className="text-muted">0</span>),
                                },
                              ]
                            : []),
                          {
                            title: 'Received',
                            dataIndex: 'receivedQty',
                            align: 'right' as const,
                            width: 110,
                            render: (v: string, i: MaterialRequestItemDto) =>
                              Number(v) >= Number(i.quantity) ? (
                                <Typography.Text type="success">{formatQty(v)}</Typography.Text>
                              ) : Number(v) > 0 ? (
                                <Typography.Text type="warning">{formatQty(v)}</Typography.Text>
                              ) : (
                                <span className="text-muted">0</span>
                              ),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            },
            ...(purchasing ? [{ key: 'buying', title: 'Quotations and purchase orders', children: <QuotationsPanel request={data} /> }] : []),
            ...(data.attachments.length > 0 ? [{ key: 'attachments', title: 'Attachments', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> }] : []),
          ],
          activity: { type: 'material_request', id: data.id, submission: data },
          actions: (size) => (
            <>
              {mayCover ? (
                <Button size={size} icon={<InboxOutlined />} onClick={() => setCovering(true)}>
                  Take from stock
                </Button>
              ) : null}
              {mayReceive ? (
                <Button type="primary" size={size} icon={<ImportOutlined />} onClick={() => setReceiving(true)}>
                  Receive material
                </Button>
              ) : null}
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="material_request" id={data.id} status={data.status} size={size} />
            </>
          ),
        }
      }
    >
      {data && approved ? <CoverFromStockModal open={covering} onClose={() => setCovering(false)} request={data} stock={stock.data} /> : null}
      <ReceiptModal open={receiving} onClose={() => setReceiving(false)} projectId={data?.projectId} materialRequestId={data?.id} />
    </RecordFrame>
  );
}

/** A line's stock (v5 item 95): at the request's own site, and how much the other sites hold, listed in a popover. */
function StockCell({ line, loading }: { line: RequestLineStockDto | undefined; loading: boolean }) {
  if (loading) return <span className="text-muted">…</span>;
  if (!line) return <span className="text-muted">-</span>;
  const elsewhere = line.others.reduce((s, o) => s + toNumber(o.balance), 0);
  return (
    <div>
      {toNumber(line.here) > 0 ? <span translate="no">{formatQty(line.here)} here</span> : <span className="text-muted">None here</span>}
      {line.others.length ? (
        <div>
          <Popover
            trigger="click"
            title={`${line.itemName} at other sites and stores`}
            content={
              <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                {line.others.map((o) => (
                  <li key={o.projectId} translate="no">
                    {o.projectName}
                    {o.store ? ' (central store)' : ''}: {formatQty(o.balance)} {line.unit}
                  </li>
                ))}
              </ul>
            }
          >
            <Button type="link" size="small" style={{ padding: 0, height: 'auto', minHeight: 24, fontSize: themeFontSize('fontSizeSM') }}>
              {formatQty(elsewhere)} at {line.others.length} {line.others.some((o) => o.store) ? 'other place' : 'other site'}
              {line.others.length === 1 ? '' : 's'}
            </Button>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}

export function MrDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <MrRecord mode="drawer" {...props} />;
}
