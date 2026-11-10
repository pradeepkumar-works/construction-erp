'use client';

import React from 'react';
import Link from 'next/link';
import { Table } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TDS_RETURN_FORM_LABELS, figure, quarterOf, type TdsDeductionDto } from '@erp/shared';
import { api } from '@/lib/api';
import { useTdsChallan } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { Money } from '@/components/common/Money';
import { RecordFrame } from '@/components/record/RecordFrame';
import { challanHref, invalidateTds, quarterHref } from './tdsUi';

/**
 * A TDS challan at `/tds/challans/<id>`: the bank's BSR code, date and serial, the tax it paid with the deductions that
 * make it up, and the interest and fee on top. It is deleted only when entered by mistake, while its quarter is open and
 * it is not in Tally.
 */
export function ChallanRecord({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useTdsChallan(id);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const remove = useMutation({ mutationFn: async () => (await api.delete(`/tds/challans/${id}`)).data });
  const q = c ? quarterOf(c.depositedOn) : null;
  const quarterOfItems = c?.items[0] ? quarterOf(c.items[0].paidOn) : q;
  return (
    <>
      <RecordFrame
        mode="page"
        kind="TDS challan"
        list={{ href: c && quarterOfItems ? quarterHref(c.form, quarterOfItems.from, 'challans') : '/tds?tab=challans', label: 'TDS returns' }}
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        record={
          c && {
            href: challanHref(c.id),
            title: `Challan · ${c.label}`,
            headline: [figure('tdsDeposited', c.tax, { count: c.deductions }), Number(c.interest) > 0 && figure('tdsInterest', c.interest)],
            facts: [
              { key: 'return', label: 'Return', children: quarterOfItems ? <Link href={quarterHref(c.form, quarterOfItems.from)}>{`${TDS_RETURN_FORM_LABELS[c.form]} ${quarterOfItems.label}`}</Link> : TDS_RETURN_FORM_LABELS[c.form] },
              { key: 'bsr', label: 'BSR code', children: <span className="mono" translate="no">{c.bsrCode}</span> },
              { key: 'serial', label: 'Challan serial', children: <span className="mono" translate="no">{c.challanSerial}</span> },
              { key: 'on', label: 'Deposited on', children: formatDate(c.depositedOn) },
              { key: 'paid', label: 'Paid', children: <Money value={c.total} paise /> },
              ...(Number(c.fee) > 0 ? [{ key: 'fee', label: 'Late fee 234E', children: <Money value={c.fee} paise /> }] : []),
            ],
            details: [
              { key: 'minor', label: 'Minor head', children: `${c.minorHead}, TDS payable by the taxpayer` },
              { key: 'tally', label: 'Tally', children: c.exportedToTally ? 'In a Tally export' : 'Not exported yet' },
              { key: 'by', label: 'Recorded', children: `${c.createdByName}, ${formatDateTime(c.createdAt)}` },
            ],
            sections: [
              {
                key: 'deductions',
                title: 'Deductions it paid',
                count: c.items.length,
                empty: !c.items.length,
                children: (
                  <Table<TdsDeductionDto>
                    rowKey="id"
                    size="small"
                    pagination={c.items.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
                    dataSource={c.items}
                    scroll={{ x: 640 }}
                    columns={[
                      { key: 'who', title: 'Deductee', render: (_, d) => <span translate="no">{d.deducteeName}</span> },
                      { key: 'section', title: 'Section', width: 110, render: (_, d) => <span translate="no">{d.sectionName}</span> },
                      { key: 'on', title: 'Paid on', width: 120, render: (_, d) => formatDate(d.paidOn) },
                      { key: 'source', title: 'From', render: (_, d) => (d.sourceHref ? <Link href={d.sourceHref}>{d.sourceLabel}</Link> : d.sourceLabel) },
                      { key: 'tds', title: 'TDS', width: 140, align: 'right', render: (_, d) => <Money value={d.tdsAmount} paise /> },
                    ]}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={4} align="right">
                          Tax in the challan
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <Money value={c.tax} paise strong />
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                ),
              },
            ],
            more: c.canDelete
              ? [
                  {
                    key: 'delete',
                    label: 'Delete',
                    danger: true,
                    onSelect: () =>
                      askDelete({
                        what: `challan ${c.label}`,
                        onConfirm: () => remove.mutateAsync(),
                        onDone: () => {
                          invalidateTds(qc);
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
