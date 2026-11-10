'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select, Typography } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import { financialYearOf, runPeriodLabel, type DepreciationRunDto, type ItBlockRowDto } from '@erp/shared';
import { tk } from '@/ds';
import { useAssetIncomeTax, useDepreciationRuns } from '@/lib/queries';
import { formatDate, formatINR, toNumber, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { Money } from '@/components/common/Money';
import { PrepareRunModal } from './AssetForms';
import { RunStatusTag, runHref } from './assetUi';

const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize, color: tk.color.text.muted };

/** Depreciation runs, newest first: each period's total and whether it is in the books. */
export function RunsList() {
  const router = useRouter();
  const [preparing, setPreparing] = useState(false);
  const { data, isLoading, isFetching, error, refetch } = useDepreciationRuns();
  const open = (id: string) => router.push(runHref(id));
  const columns: ListColumn<DepreciationRunDto>[] = [
    {
      key: 'period',
      title: 'Period',
      locked: true,
      render: (_, r) => (
        <div>
          <RecordLink href={runHref(r.id)} onOpen={() => open(r.id)} strong>
            {r.period}
          </RecordLink>{' '}
          <RunStatusTag status={r.status} />
          <span style={caption}>{`${formatDate(r.from)} to ${formatDate(r.to)}`}</span>
        </div>
      ),
    },
    { key: 'assets', title: 'Assets', width: 100, align: 'right', render: (_, r) => r.assets },
    { key: 'total', title: 'Depreciation', kind: 'money', value: (r) => r.total, width: 160 },
    { key: 'voucher', title: 'Voucher', width: 150, render: (_, r) => (r.voucherNo ? <span className="mono" translate="no">{r.voucherNo}</span> : NO_VALUE), defaultFrom: 1024 },
    { key: 'by', title: 'Posted by', width: 200, render: (_, r) => (r.postedByName ? <span>{r.postedByName}<span style={caption}>{formatDate(r.postedAt?.slice(0, 10))}</span></span> : NO_VALUE), defaultFrom: 1280 },
  ];
  const choice = useColumnChoice('depreciation-runs', columns);
  const newButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setPreparing(true)}>
      Prepare depreciation
    </Button>
  );
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: tk.space[3] }}>{newButton}</div>
      <DataTable<DepreciationRunDto>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={data ?? []}
        loading={isLoading || isFetching}
        table={{ pagination: false }}
        onOpen={open}
        failed={!!error}
        emptyText={<EmptyArt art="entries" title="No depreciation run yet" />}
        emptyAction={newButton}
      />
      <PrepareRunModal open={preparing} onClose={() => setPreparing(false)} onSaved={open} />
    </>
  );
}

type BlockRow = ItBlockRowDto & { id: string };
const fyCode = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

/** Income Tax depreciation by block for a financial year, for the return; it is not posted to the books. */
export function IncomeTaxBlocks() {
  const now = Number(financialYearOf(new Date().toISOString().slice(0, 10)).from.slice(0, 4));
  const [fy, setFy] = useState(fyCode(now - 1));
  const { data, isLoading, isFetching, error, refetch } = useAssetIncomeTax(fy);
  const columns: ListColumn<BlockRow>[] = [
    { key: 'block', title: 'Block', locked: true, render: (_, b) => <span>{b.label}<span style={caption}>{`${b.ratePct}% a year`}</span></span> },
    { key: 'opening', title: 'Opening WDV', kind: 'money', value: (b) => b.openingWdv, width: 150 },
    {
      key: 'additions',
      title: 'Additions',
      width: 170,
      align: 'right',
      render: (_, b) => (
        <span>
          <Money value={b.additions} />
          {toNumber(b.halfRateAdditions) ? (
            <span style={caption}>
              <Money value={b.halfRateAdditions} /> at half rate
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'disposals', title: 'Sold', kind: 'money', value: (b) => b.disposals, width: 140 },
    { key: 'depreciation', title: 'Depreciation', kind: 'money', value: (b) => b.depreciation, width: 150, total: (rows) => formatINR(rows.reduce((n, b) => n + toNumber(b.depreciation), 0)) },
    { key: 'closing', title: 'Closing WDV', kind: 'money', value: (b) => b.closingWdv, width: 150 },
    {
      key: 'gain',
      title: 'Capital gain',
      width: 150,
      align: 'right',
      render: (_, b) => (toNumber(b.shortTermGain) ? <Money value={b.shortTermGain} tone={toNumber(b.shortTermGain) < 0 ? 'danger' : undefined} /> : NO_VALUE),
      defaultFrom: 1280,
    },
  ];
  const choice = useColumnChoice('asset-income-tax', columns);
  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: tk.space[3], alignItems: 'center', marginBottom: tk.space[3] }}>
        <Select aria-label="Financial year" style={{ minWidth: 140 }} value={fy} onChange={setFy} options={[0, 1, 2, 3].map((i) => ({ value: fyCode(now - i), label: runPeriodLabel(`${now - i}-04-01`, `${now - i + 1}-03-31`) }))} />
        <Typography.Text type="secondary">Rolled from the register: each block’s value carries from year to year, half the rate on what was used under 180 days.</Typography.Text>
      </div>
      <DataTable<BlockRow>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={(data?.blocks ?? []).map((b) => ({ ...b, id: b.block }))}
        loading={isLoading || isFetching}
        table={{ pagination: false }}
        failed={!!error}
        emptyText={<EmptyArt art="entries" title={`No asset in use in ${fy}`} />}
      />
    </>
  );
}
