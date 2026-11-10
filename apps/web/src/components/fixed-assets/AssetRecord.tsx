'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Table } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ASSET_CLASSES, ASSET_FUNDING_LABELS, DEPRECIATION_METHOD_LABELS, figure, type AssetChargeDto, type AssetTransferDto, type FixedAssetDetailDto } from '@erp/shared';
import { api } from '@/lib/api';
import { useFixedAsset } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Money } from '@/components/common/Money';
import { RecordFrame } from '@/components/record/RecordFrame';
import { projectContext } from '@/components/record/RecordParts';
import { AssetFormDrawer, DisposeModal, TransferModal } from './AssetForms';
import { AssetStatusTag, RunStatusTag, assetHref, invalidateAssets, runHref } from './assetUi';

const LIST = { href: '/fixed-assets', label: 'Fixed assets' };

function Charges({ charges }: { charges: AssetChargeDto[] }) {
  return (
    <Table<AssetChargeDto>
      rowKey="runId"
      size="small"
      pagination={charges.length > 24 ? { pageSize: 24, showSizeChanger: false } : false}
      dataSource={charges}
      scroll={{ x: 520 }}
      columns={[
        {
          key: 'period',
          title: 'Period',
          render: (_, c) => (
            <span>
              <Link href={runHref(c.runId)}>{c.period}</Link> <RunStatusTag status={c.status} />
            </span>
          ),
        },
        { key: 'days', title: 'Days', width: 200, render: (_, c) => `${formatDate(c.from)} to ${formatDate(c.to)}` },
        { key: 'amount', title: 'Depreciation', width: 150, align: 'right', render: (_, c) => <Money value={c.amount} paise /> },
      ]}
    />
  );
}

function Moves({ transfers }: { transfers: AssetTransferDto[] }) {
  return (
    <Table<AssetTransferDto>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={transfers}
      scroll={{ x: 560 }}
      columns={[
        { key: 'on', title: 'Moved on', width: 120, render: (_, t) => formatDate(t.on) },
        { key: 'from', title: 'From', render: (_, t) => t.fromName ?? 'Head office' },
        { key: 'to', title: 'To', render: (_, t) => t.toName ?? 'Head office' },
        { key: 'by', title: 'By', width: 160, render: (_, t) => (t.note ? `${t.byName} · ${t.note}` : t.byName) },
      ]}
    />
  );
}

const disposalWords = (a: FixedAssetDetailDto) => {
  const r = toNumber(a.disposalResult);
  if (!r) return 'at book value';
  return `${formatINR(Math.abs(r))} ${r > 0 ? 'profit' : 'loss'}`;
};

/** One fixed asset at `/fixed-assets/<id>`: its cost and book value, the runs that charged it, where it has been and its sale. */
export function AssetRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: a, isLoading, error, refetch } = useFixedAsset(id);
  const [dialog, setDialog] = useState<'edit' | 'move' | 'dispose' | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/fixed-assets/${id}`)).data });
  const active = a?.status === 'ACTIVE';

  return (
    <>
      <RecordFrame
        mode="page"
        kind="Fixed asset"
        list={LIST}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          a && {
            href: assetHref(a.id),
            title: <span translate="no">{`${a.assetNo} · ${a.name}`}</span>,
            tags: <AssetStatusTag status={a.status} />,
            context: a.projectId && a.projectName ? projectContext({ projectId: a.projectId, projectName: a.projectName }) : { label: 'Head office' },
            headline: [figure('assetBookValue', a.bookValue, { when: 'today' }), figure('assetDepreciation', a.depreciation, { when: 'toDate' })],
            facts: [
              { key: 'cost', label: 'Cost', children: <Money value={a.cost} paise strong /> },
              { key: 'class', label: 'Class', children: ASSET_CLASSES[a.assetClass].label },
              { key: 'method', label: 'Depreciation', children: `${DEPRECIATION_METHOD_LABELS[a.method]} over ${a.lifeYears} years${a.wdvRatePct ? `, ${toNumber(a.wdvRatePct)}% a year` : ''}` },
              { key: 'residual', label: 'Residual value', children: <Money value={a.residual} paise /> },
              { key: 'putToUse', label: 'Put to use', children: formatDate(a.putToUseOn) },
              { key: 'scheduled', label: 'Due to date', children: <Money value={a.scheduledToDate} paise /> },
              ...(a.status === 'DISPOSED' ? [{ key: 'disposed', label: 'Sold or scrapped', children: `${formatDate(a.disposedOn)} for ${formatINR(a.proceeds ?? 0)}, ${disposalWords(a)}` }] : []),
            ],
            details: [
              { key: 'funded', label: 'Paid for', children: a.vendorName ? `${ASSET_FUNDING_LABELS[a.fundedBy]} · ${a.vendorName}` : ASSET_FUNDING_LABELS[a.fundedBy] },
              ...(a.invoiceNo ? [{ key: 'invoice', label: 'Invoice', children: <span translate="no">{a.invoiceNo}</span> }] : []),
              ...(a.serialNo ? [{ key: 'serial', label: 'Serial no.', children: <span translate="no">{a.serialNo}</span> }] : []),
              ...(a.equipmentId ? [{ key: 'machine', label: 'Machine', children: <Link href="/machinery?tab=equipment" translate="no">{a.equipmentCode}</Link> }] : []),
              ...(a.openingAsOf ? [{ key: 'opening', label: 'Before Nirmaan', children: `${formatINR(a.openingDepreciation)} depreciation up to ${formatDate(a.openingAsOf)}` }] : []),
              ...(a.note ? [{ key: 'note', label: 'Note', span: 2, children: <span style={{ whiteSpace: 'pre-wrap' }}>{a.note}</span> }] : []),
            ],
            sections: [
              { key: 'charges', title: 'Depreciation runs', count: a.charges.length, empty: !a.charges.length, children: <Charges charges={a.charges} /> },
              { key: 'moves', title: 'Where it has been', count: a.transfers.length, empty: !a.transfers.length, children: <Moves transfers={a.transfers} /> },
            ],
            actions: (size) =>
              active ? (
                <>
                  <Button size={size} onClick={() => setDialog('move')}>
                    Move
                  </Button>
                  <Button size={size} onClick={() => setDialog('dispose')}>
                    Sell or scrap
                  </Button>
                  <Button size={size} onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                </>
              ) : (
                <Button size={size} onClick={() => setDialog('edit')}>
                  Edit
                </Button>
              ),
            more: active
              ? [
                  {
                    key: 'delete',
                    label: a.charged ? 'Delete (a posted run charged it)' : 'Delete',
                    danger: true,
                    disabled: a.charged,
                    onSelect: () =>
                      askDelete({
                        what: `asset ${a.assetNo}`,
                        description: 'Its purchase leaves the books. Use it for an asset entered by mistake.',
                        onConfirm: () => remove.mutateAsync(),
                        onDone: () => {
                          invalidateAssets(qc);
                          onClose();
                        },
                      }),
                  },
                ]
              : [],
          }
        }
      />
      {a ? (
        <>
          <AssetFormDrawer open={dialog === 'edit'} asset={a} onClose={() => setDialog(null)} />
          <TransferModal open={dialog === 'move'} asset={a} onClose={() => setDialog(null)} />
          <DisposeModal open={dialog === 'dispose'} asset={a} onClose={() => setDialog(null)} />
        </>
      ) : null}
      {deleteDialog}
    </>
  );
}
