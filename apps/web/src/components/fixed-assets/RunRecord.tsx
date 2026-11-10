'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, App, Button, Table } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ASSET_CLASSES, DEPRECIATION_METHOD_LABELS, figure, type DepreciationLineDto, type DepreciationRunDetailDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useDepreciationRun } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Money } from '@/components/common/Money';
import { RecordFrame } from '@/components/record/RecordFrame';
import { RunStatusTag, assetHref, invalidateAssets, runHref } from './assetUi';

const LIST = { href: '/fixed-assets?tab=runs', label: 'Depreciation runs' };

function Lines({ run }: { run: DepreciationRunDetailDto }) {
  return (
    <Table<DepreciationLineDto>
      rowKey="assetId"
      size="small"
      pagination={run.lines.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
      dataSource={run.lines}
      scroll={{ x: 640 }}
      columns={[
        {
          key: 'asset',
          title: 'Asset',
          render: (_, l) => (
            <span>
              <Link href={assetHref(l.assetId)}>{l.name}</Link> <span className="mono text-muted" translate="no">{l.assetNo}</span>
            </span>
          ),
        },
        { key: 'class', title: 'Class', width: 220, render: (_, l) => `${ASSET_CLASSES[l.assetClass].label}, ${DEPRECIATION_METHOD_LABELS[l.method]}` },
        { key: 'days', title: 'Days', width: 200, render: (_, l) => (l.from === run.from && l.to === run.to ? 'The whole period' : `${formatDate(l.from)} to ${formatDate(l.to)}`) },
        { key: 'amount', title: 'Depreciation', width: 150, align: 'right', render: (_, l) => <Money value={l.amount} paise /> },
      ]}
      summary={() =>
        run.lines.length ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3} align="right">
              Total
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Money value={run.total} paise strong />
            </Table.Summary.Cell>
          </Table.Summary.Row>
        ) : null
      }
    />
  );
}

/**
 * A depreciation run at `/fixed-assets/runs/<id>`: each asset's charge for the period. A draft is prepared again
 * whenever the register changes and posted as one voucher; a posted run comes back out only while the books are open.
 */
export function RunRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const { modal } = App.useApp();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: r, isLoading, error, refetch } = useDepreciationRun(id);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const step = useMutation({
    mutationFn: async (to: 'post' | 'refresh' | 'undo-post') => (await api.post<DepreciationRunDetailDto>(`/fixed-assets/runs/${id}/${to}`)).data,
    onSuccess: (run, to) => {
      invalidateAssets(qc);
      notify.saved(to === 'post' ? `Depreciation for ${run.period} is in the books as ${run.voucherNo ?? 'a journal'}` : to === 'refresh' ? `Prepared again: ${formatINR(run.total)} on ${run.assets} assets` : `Depreciation for ${run.period} is out of the books`);
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/fixed-assets/runs/${id}`)).data });
  const draft = r?.status === 'DRAFT';

  return (
    <>
      <RecordFrame
        mode="page"
        kind="Depreciation run"
        list={LIST}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          r && {
            href: runHref(r.id),
            title: `Depreciation · ${r.period}`,
            tags: <RunStatusTag status={r.status} />,
            headline: [figure('depreciationRunTotal', r.total, { count: r.assets })],
            notices: draft && r.postProblem ? <Alert type="warning" showIcon title="It cannot be posted yet" description={r.postProblem} /> : null,
            facts: [
              { key: 'period', label: 'Period', children: `${formatDate(r.from)} to ${formatDate(r.to)}` },
              { key: 'voucher', label: 'Voucher', children: r.voucherNo ? <span className="mono" translate="no">{r.voucherNo}</span> : 'Posted as one journal' },
              { key: 'prepared', label: 'Prepared', children: `${r.preparedByName}, ${formatDateTime(r.preparedAt)}` },
              ...(r.postedByName && r.postedAt ? [{ key: 'posted', label: 'Posted', children: `${r.postedByName}, ${formatDateTime(r.postedAt)}` }] : []),
            ],
            sections: [{ key: 'lines', title: 'Assets charged', count: r.lines.length, empty: !r.lines.length, children: <Lines run={r} /> }],
            actions: (size) =>
              draft ? (
                <>
                  <Button size={size} type="primary" disabled={!!r.postProblem || !r.lines.length} loading={step.isPending && step.variables === 'post'} onClick={() => step.mutate('post')}>
                    {`Post ${formatINR(r.total)}`}
                  </Button>
                  <Button size={size} loading={step.isPending && step.variables === 'refresh'} onClick={() => step.mutate('refresh')}>
                    Prepare again
                  </Button>
                </>
              ) : (
                <Button
                  size={size}
                  onClick={() =>
                    modal.confirm({
                      title: `Take depreciation for ${r.period} out of the books?`,
                      content: 'Its journal leaves the books and the run goes back to a draft. Use it to correct a run, then post it again.',
                      okText: 'Undo posting',
                      onOk: () => step.mutateAsync('undo-post'),
                    })
                  }
                >
                  Undo posting
                </Button>
              ),
            more: draft
              ? [
                  {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    onSelect: () =>
                      askDelete({
                        what: `the run for ${r.period}`,
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
      {deleteDialog}
    </>
  );
}
