'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Select, Typography } from 'antd';
import { PlusOutlined } from '@/components/common/icons';
import { ASSET_CLASSES, ASSET_CLASS_CODES, DEPRECIATION_METHOD_LABELS, FIXED_ASSET_STATUS_LABELS, figure, type FixedAssetDto, type FixedAssetStatus } from '@erp/shared';
import { tk } from '@/ds';
import { useAssetBooksCheck, useFixedAssets } from '@/lib/queries';
import { useNewIntent } from '@/lib/new-intent';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
import { Figures } from '@/components/figures';
import { AssetFormDrawer } from './AssetForms';
import { AssetStatusTag, assetHref } from './assetUi';

type SortField = 'assetNo' | 'putToUseOn' | 'cost';
const KEYS = ['status', 'assetClass'] as const;
const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize, color: tk.color.text.muted };

/**
 * The register: each asset with its cost, depreciation in the books and net book value, the totals of those in use,
 * and the balance sheet's PPE line beside them so a difference shows.
 */
export function AssetRegister() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  useNewIntent('fixed-asset', true, () => setAdding(true));
  const open = (id: string) => router.push(assetHref(id));
  const frame = useListFrame<SortField, FixedAssetDto>({
    list: 'fixed-assets',
    keys: KEYS,
    sortBy: 'assetNo',
    sortOrder: 'desc',
    sortFields: ['assetNo', 'putToUseOn', 'cost'],
    allLabel: 'In use',
    moreViews: [
      { key: 'disposed', label: 'Disposed', filters: { status: 'DISPOSED' } },
      { key: 'everything', label: 'All assets', filters: { status: 'ALL' } },
    ],
    chipLabels: { status: (v) => (v === 'ALL' ? 'All assets' : FIXED_ASSET_STATUS_LABELS[v as FixedAssetStatus]), assetClass: (v) => ASSET_CLASSES[v as keyof typeof ASSET_CLASSES]?.label ?? v },
    columns: (sortOrderFor): ListColumn<FixedAssetDto>[] => [
      {
        key: 'asset',
        title: 'Asset',
        locked: true,
        sorter: true,
        sortOrder: sortOrderFor('assetNo'),
        render: (_, a) => (
          <div>
            <RecordLink href={assetHref(a.id)} onOpen={() => open(a.id)} strong>
              {a.name}
            </RecordLink>{' '}
            {a.status === 'DISPOSED' ? <AssetStatusTag status={a.status} /> : null}
            <span style={caption} translate="no">
              {[a.assetNo, a.equipmentCode, a.serialNo].filter(Boolean).join(' · ')}
            </span>
          </div>
        ),
      },
      { key: 'class', title: 'Class', width: 220, render: (_, a) => <span>{ASSET_CLASSES[a.assetClass].label}<span style={caption}>{`${DEPRECIATION_METHOD_LABELS[a.method]}, ${a.lifeYears} years`}</span></span>, defaultFrom: 1280 },
      { key: 'place', title: 'Where', width: 200, render: (_, a) => a.projectName ?? 'Head office', defaultFrom: 1440 },
      { key: 'putToUseOn', title: 'Put to use', width: 120, sorter: true, sortOrder: sortOrderFor('putToUseOn'), render: (_, a) => formatDate(a.putToUseOn), defaultFrom: 1024 },
      { key: 'cost', title: 'Cost', kind: 'money', value: (a) => a.cost, width: 140, sorter: true, sortOrder: sortOrderFor('cost') },
      { key: 'depreciation', title: 'Depreciation', kind: 'money', value: (a) => a.depreciation, width: 140 },
      { key: 'bookValue', title: 'Net book value', kind: 'money', value: (a) => a.bookValue, width: 150 },
    ],
  });
  const { page } = frame;
  const status = page.filters.status as FixedAssetStatus | 'ALL' | undefined;
  const assetClass = page.filters.assetClass;
  const { data, isLoading, isFetching, error, refetch } = useFixedAssets({
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
    status: status === 'ALL' ? undefined : (status ?? 'ACTIVE'),
    assetClass,
  });
  const check = useAssetBooksCheck();
  const s = data?.summary;
  const c = check.data;
  const off = c ? Math.abs(toNumber(c.difference)) >= 1 : false;

  const newButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
      New fixed asset
    </Button>
  );

  return (
    <>
      {s ? (
        <div style={{ marginBottom: tk.space[4] }}>
          <Figures
            label="Fixed asset figures"
            figures={[
              figure('assetCost', s.cost, { count: s.count }),
              figure('assetDepreciation', s.depreciation, { when: 'toDate' }),
              figure('assetBookValue', s.bookValue, { when: 'today', ...(c && off ? { caveat: `The balance sheet's property, plant and equipment is ${formatINR(c.ppe)}, ${formatINR(Math.abs(toNumber(c.difference)))} ${toNumber(c.difference) > 0 ? 'more' : 'less'}: fixed assets in the books outside the register` } : {}) }),
            ]}
          />
          {c && !off ? (
            <Typography.Text type="secondary" style={caption}>
              Equals the balance sheet’s property, plant and equipment today.
            </Typography.Text>
          ) : null}
        </div>
      ) : null}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {frame.views}
      <ListToolbar filters={frame.filterState} projectId={undefined} onProject={() => undefined} hideProject search={page.search} onSearch={page.setSearch} searchPlaceholder="Search asset no., name, serial or machine" searchLabel="Search fixed assets" extra={newButton}>
        <Select
          aria-label="Class"
          allowClear
          placeholder="Every class"
          style={{ minWidth: 220 }}
          value={assetClass}
          onChange={(v) => page.setFilter('assetClass', v)}
          options={ASSET_CLASS_CODES.map((k) => ({ value: k, label: ASSET_CLASSES[k].label }))}
        />
      </ListToolbar>
      <DataTable<FixedAssetDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<FixedAssetDto>(data?.total)}
        onOpen={open}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        emptyText={<EmptyArt art="entries" title={frame.empty.filtered ? 'No asset matches these filters' : 'No fixed asset yet'} />}
        emptyAction={newButton}
      />
      <AssetFormDrawer open={adding} onClose={() => setAdding(false)} onSaved={open} />
    </>
  );
}
