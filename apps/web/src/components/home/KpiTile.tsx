'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Typography, theme } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { formatMonthName, formatPct } from '@/lib/format';

/**
 * A small trend line under a KPI figure, drawn as plain SVG: a page has up to six of these, and a chart library instance
 * each would slow the page down just as it opens.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const { token } = theme.useToken();
  const id = `spark${React.useId().replace(/[^\w-]/g, '')}`;
  if (values.length < 2) return null;
  const W = 120;
  const H = 36;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - ((v - min) / span) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block', marginTop: token.marginXS, overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export interface Trend {
  values: number[];
  /** Change of this month on last month, in % (null when last month was nil or too small to compare with, and then not shown) */
  deltaPct: number | null;
  /** This month over last month, for a jump too big to read as a percentage */
  ratio: number | null;
  /** Last month's short name, e.g. "Sep" */
  previous: string;
  /** Whether more is good news (work done, billing, cash in) or not (cost) */
  upIsGood: boolean;
  /** Share of this month gone by (1 once it is over): a month under way is compared with last month's pace */
  elapsed: number;
}

/**
 * How many tiles go on a row: as many as fit (4 on a laptop, 3 on a tablet, 2 on a phone), spread so the rows are even,
 * so six tiles are two rows of three rather than four and two.
 */
export function kpiColumns(count: number, screens: Partial<Record<'sm' | 'lg', boolean>>): number {
  const max = screens.lg ? 4 : screens.sm ? 3 : 2;
  if (count <= 0) return 1;
  return Math.min(max, Math.ceil(count / Math.ceil(count / max)));
}

/** Share of the month `month` (YYYY-MM) gone by on `today` (YYYY-MM-DD): 1 for a past month. */
export function monthElapsed(month: string, today = dayjs().format('YYYY-MM-DD')): number {
  if (today.slice(0, 7) !== month) return 1;
  return dayjs(today).date() / dayjs(today).daysInMonth();
}

/**
 * Last six months of a series into a tile's trend: this month on last month. Last month is no base to compare with
 * when it was nil or under a tenth of the best month before it (UX item 85), so no percentage is shown then.
 */
export function trendOf(series: (string | number)[], months: string[], upIsGood = true, today?: string): Trend {
  const values = series.map(Number);
  const now = values[values.length - 1] ?? 0;
  const before = values[values.length - 2] ?? 0;
  const best = Math.max(0, ...values.slice(0, -1));
  const base = before > 0 && before >= best / 10;
  return {
    values,
    deltaPct: base ? Math.round(((now - before) / before) * 100) : null,
    ratio: base ? now / before : null,
    previous: formatMonthName(months[months.length - 2] ?? null),
    upIsGood,
    elapsed: monthElapsed(months[months.length - 1] ?? '', today),
  };
}

/**
 * Whether a trend is bad news worth colour (UX items 82 and 85): a move the wrong way of 10% or more. A fall in a month
 * still under way counts only when it is 10% or more behind last month's pace too, so the 3rd of the month is no alarm.
 */
export function isBadTrend(t: Trend): boolean {
  const delta = t.deltaPct;
  if (delta === null || delta === 0 || delta > 0 === t.upIsGood || Math.abs(delta) < 10) return false;
  if (delta > 0) return true;
  const now = t.values[t.values.length - 1] ?? 0;
  const before = t.values[t.values.length - 2] ?? 0;
  return now < before * t.elapsed * 0.9;
}

/**
 * One KPI card: the figure keeps the card's full width and the tile's icon sits in a tinted square in the top right
 * corner. With a trend it shows this month against last and a six-month sparkline (UI roadmap item 59). The page lays
 * the tiles out in even rows (see `kpiColumns`), and every card stretches to the tallest so a row reads as one band.
 */
export function KpiTile({ href, icon, trend, children }: { href?: string; icon?: React.ReactNode; trend?: Trend; children: React.ReactNode }) {
  const { token } = theme.useToken();
  const delta = trend?.deltaPct ?? null;
  // Colour marks an exception only (UX items 82 and 85): see `isBadTrend`. A rise, a small dip or a slow start stay neutral.
  const bad = !!trend && isBadTrend(trend);
  const soFar = !!trend && trend.elapsed < 1 && delta !== null && delta < 0 ? ' so far' : '';
  const card = (
    <Card className="kpi-card" hoverable={!!href} style={{ height: '100%', position: 'relative' }}>
      {icon ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: token.paddingLG,
            right: token.paddingLG,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: token.controlHeight,
            height: token.controlHeight,
            borderRadius: token.borderRadiusLG,
            background: token.colorPrimaryBg,
            color: token.colorPrimary,
            fontSize: token.fontSizeLG,
          }}
        >
          {icon}
        </span>
      ) : null}
      {children}
      {trend && (
        <>
          {delta !== null && (
            <Typography.Text style={{ display: 'block', fontSize: token.fontSizeSM, marginTop: token.marginXXS }} type={bad ? 'danger' : 'secondary'}>
              {delta > 0 ? <ArrowUpOutlined aria-hidden /> : delta < 0 ? <ArrowDownOutlined aria-hidden /> : null} {delta >= 200 && trend.ratio ? `${Math.round(trend.ratio)}× ${trend.previous}` : `${formatPct(Math.abs(delta))} ${delta >= 0 ? 'up' : 'down'} on ${trend.previous}${soFar}`}
            </Typography.Text>
          )}
          {trend.values.some((v) => v !== 0) && <Sparkline values={trend.values} color={bad ? token.colorError : token.colorPrimary} />}
        </>
      )}
    </Card>
  );
  return href ? (
    <Link href={href} style={{ display: 'block', height: '100%' }}>
      {card}
    </Link>
  ) : (
    card
  );
}
