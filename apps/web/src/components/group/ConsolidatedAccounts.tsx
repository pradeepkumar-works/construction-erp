'use client';

import React, { useMemo } from 'react';
import { Button, Flex, Segmented, Typography } from 'antd';
import dayjs from 'dayjs';
import { tk } from '@/ds';
import {
  CONSOLIDATION_BASES,
  CONSOLIDATION_BASIS_LABELS,
  consolidationNote,
  type ConsolidatedRowDto,
  type ConsolidationBasis,
  type ConsolidationDto,
  type SisterPairDto,
} from '@erp/shared';
import { DownloadOutlined } from '@/components/common/icons';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import type { ListColumn } from '@/components/list/DataTable';
import { PeriodPicker, day } from '@/components/statements/statementsUi';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { formatDate, formatINR } from '@/lib/format';

type Row = ConsolidatedRowDto & { id: string };

const isZero = (v: string) => Number(v) === 0;
/** A line with nothing in any column is left out; totals always show. */
const shown = (r: ConsolidatedRowDto) => r.total || !isZero(r.group) || !isZero(r.eliminated) || Object.values(r.companies).some((v) => !isZero(v));

/** The profit and loss rows, or the balance sheet's: each section's lines, then its total, then each side's total. */
export function statementRows(data: ConsolidationDto, which: 'pl' | 'bs'): Row[] {
  const rows =
    which === 'pl'
      ? data.profitLoss
      : [
          ...data.balanceSheet.sections.filter((s) => s.side === 'LIABILITY').flatMap((s) => [...s.rows, s.total]),
          data.balanceSheet.totalLiabilities,
          ...data.balanceSheet.sections.filter((s) => s.side === 'ASSET').flatMap((s) => [...s.rows, s.total]),
          data.balanceSheet.totalAssets,
        ];
  return rows.filter(shown).map((r) => ({ ...r, id: r.key }));
}

/** One statement: a column per company, the eliminations and the group. */
export function ConsolidatedStatement({ data, which, loading }: { data: ConsolidationDto | undefined; which: 'pl' | 'bs'; loading: boolean }) {
  const columns = useMemo<ListColumn<Row>[]>(
    () => [
      {
        key: 'line',
        title: 'Particulars',
        width: 200,
        locked: true,
        card: 'title',
        cardText: (r) => r.label,
        render: (_, r) => (r.total ? <strong>{r.label}</strong> : r.label),
      },
      ...(data?.companies ?? []).map<ListColumn<Row>>((c) => ({
        key: `company-${c.id}`,
        label: c.name,
        // A company's name wraps in its header, so five companies, what came out and the group fit at 1440.
        title: (
          <span translate="no" style={{ whiteSpace: 'normal' }}>
            {c.name}
          </span>
        ),
        kind: 'money',
        width: 120,
        value: (r) => r.companies[c.id],
        defaultFrom: 1280,
      })),
      { key: 'eliminated', title: 'Between sisters', kind: 'money', width: 120, value: (r) => r.eliminated, defaultFrom: 1024 },
      { key: 'group', title: 'Group', kind: 'money', width: 130, strong: true, value: (r) => r.group, card: 'amount' },
    ],
    [data?.companies],
  );
  return (
    <LocalDataTable<Row>
      list={`consolidated-${which}`}
      columns={columns}
      rows={data ? statementRows(data, which) : []}
      loading={loading}
      failed={false}
      emptyText="Nothing in the books of the group for this period"
      whole
    />
  );
}

/** How far each company's figures run and how final they are, as its column says. */
export function CompanyNotes({ data }: { data: ConsolidationDto }) {
  return (
    <ul style={{ margin: `${tk.space[3]} 0 0`, paddingLeft: tk.space[4], color: tk.color.text.muted, ...tk.type.caption }} data-testid="company-notes">
      {data.companies.map((c) => (
        <li key={c.id}>
          <span translate="no">{c.name}</span>: {consolidationNote(c, data.basis, data.to, formatDate)}
          {c.to !== data.to ? `. Figures to ${formatDate(c.to)}` : ''}
          {!isZero(c.difference) ? `. Its own balance sheet is out by ${formatINR(c.difference)}` : ''}
        </li>
      ))}
    </ul>
  );
}

type PairRow = SisterPairDto & { id: string };

const what = (p: SisterPairDto) => (p.kind === 'SALES' ? `${p.a.name} sold to ${p.b.name}` : `${p.b.name} owes ${p.a.name}`);
const notNamed = (p: SisterPairDto) => [p.a, p.b].filter((s) => !s.named).map((s) => `${s.name} has not named the other as a sister`);

/** Every pair of figures that should agree between sisters, with what came out and the difference to settle. */
export function SisterPairs({ data, loading }: { data: ConsolidationDto | undefined; loading: boolean }) {
  const columns = useMemo<ListColumn<PairRow>[]>(
    () => [
      {
        key: 'what',
        title: 'Between sisters',
        locked: true,
        card: 'title',
        cardText: what,
        render: (_, p) => (
          <div>
            <Flex gap={tk.space[2]} align="center" wrap>
              <AppTag variant="kind">{p.kind === 'SALES' ? 'Sales' : 'Balance'}</AppTag>
              <span translate="no">{what(p)}</span>
            </Flex>
            {notNamed(p).map((t) => (
              <div key={t} style={{ ...tk.type.caption, color: tk.color.text.muted }}>
                {t}
              </div>
            ))}
          </div>
        ),
      },
      { key: 'aName', title: 'Company', width: 200, render: (_, p) => <span translate="no">{p.a.name}</span>, defaultFrom: 1280 },
      { key: 'a', title: 'In its books', kind: 'money', width: 140, value: (p) => p.a.amount },
      { key: 'bName', title: 'Sister', width: 200, render: (_, p) => <span translate="no">{p.b.name}</span>, defaultFrom: 1280 },
      { key: 'b', title: "In the sister's books", kind: 'money', width: 150, value: (p) => p.b.amount },
      { key: 'eliminated', title: 'Taken out', kind: 'money', width: 140, value: (p) => p.eliminated, defaultFrom: 1024 },
      { key: 'difference', title: 'Difference', kind: 'money', width: 140, strong: true, value: (p) => p.difference, tone: (p) => (isZero(p.difference) ? undefined : 'danger'), card: 'amount' },
    ],
    [],
  );
  return (
    <LocalDataTable<PairRow>
      list="consolidated-sisters"
      columns={columns}
      rows={(data?.pairs ?? []).map((p) => ({ ...p, id: p.key }))}
      loading={loading}
      failed={false}
      emptyText={
        <Flex vertical align="center" gap={tk.space[2]} style={{ padding: tk.space[4] }}>
          <Typography.Text type="secondary">No sister companies named in the group&apos;s books.</Typography.Text>
          <LinkButton href="/group/sisters">Name sister companies</LinkButton>
        </Flex>
      }
    />
  );
}

/** The period, how far each company runs, and the download of the statement shown. */
export function ConsolidationToolbar({
  period,
  onPeriod,
  basis,
  onBasis,
  data,
  which,
}: {
  period: [dayjs.Dayjs, dayjs.Dayjs];
  onPeriod: (p: [dayjs.Dayjs, dayjs.Dayjs]) => void;
  basis: ConsolidationBasis;
  onBasis: (b: ConsolidationBasis) => void;
  data: ConsolidationDto | undefined;
  which: 'pl' | 'bs' | 'sisters';
}) {
  const download = () => {
    if (!data) return;
    if (which === 'sisters') {
      void downloadXlsx(
        exportFileName('consolidation-between-sisters'),
        'Between sisters',
        [
          { header: 'Between sisters', value: (p: SisterPairDto) => what(p), width: 50 },
          { header: 'Company', value: (p) => p.a.name, width: 32 },
          { header: 'In its books', value: (p) => Number(p.a.amount), width: 18 },
          { header: 'Sister', value: (p) => p.b.name, width: 32 },
          { header: "In the sister's books", value: (p) => Number(p.b.amount), width: 18 },
          { header: 'Taken out', value: (p) => Number(p.eliminated), width: 18 },
          { header: 'Difference', value: (p) => Number(p.difference), width: 18 },
        ],
        data.pairs,
      );
      return;
    }
    void downloadXlsx(
      exportFileName(which === 'pl' ? 'consolidated-profit-and-loss' : 'consolidated-balance-sheet'),
      which === 'pl' ? 'Profit and loss' : 'Balance sheet',
      [
        { header: 'Particulars', value: (r: Row) => r.label, width: 44 },
        ...data.companies.map((c) => ({ header: c.name, value: (r: Row) => Number(r.companies[c.id] ?? 0), width: 20 })),
        { header: 'Between sisters', value: (r: Row) => Number(r.eliminated), width: 18 },
        { header: 'Group', value: (r: Row) => Number(r.group), width: 20 },
      ],
      statementRows(data, which),
    );
  };
  return (
    <Flex justify="space-between" gap={tk.space[2]} wrap style={{ marginBottom: tk.space[3] }}>
      <Flex gap={tk.space[2]} wrap align="center">
        <PeriodPicker value={period} onChange={onPeriod} />
        <Segmented<ConsolidationBasis>
          aria-label="Figures to"
          value={basis}
          onChange={onBasis}
          options={CONSOLIDATION_BASES.map((b) => ({ value: b, label: CONSOLIDATION_BASIS_LABELS[b] }))}
        />
      </Flex>
      <Button icon={<DownloadOutlined />} onClick={download} disabled={!data}>
        Download
      </Button>
    </Flex>
  );
}

export const periodQuery = (p: [dayjs.Dayjs, dayjs.Dayjs]) => ({ from: day(p[0]), to: day(p[1]) });
