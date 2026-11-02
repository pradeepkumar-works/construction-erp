'use client';

import React from 'react';
import { Grid } from 'antd';
import { Column, Line, Pie } from '@ant-design/plots';
import type { CashWeekDto, CostHeadsDto, EarnedValuePointDto, HomeTrendsDto } from '@erp/shared';
import { useAppearance, useReducedMotion } from '@/lib/appearance';
import { formatINRCompact, formatPct, toNumber, RUPEE } from '@/lib/format';
import { COST_HEADS, monthLabel } from './chartData';
import { useResolved } from '@/ds/react';

/**
 * The home page's charts, drawn with @ant-design/plots on a canvas, so coloured from the resolved tokens (`c`): light
 * and dark follow the user's appearance. This module is only loaded by the pages that draw a chart. They draw without
 * animating when the system asks for less motion; the summary and the table view are `ChartCard`'s.
 */

export function useChartTheme() {
  const r = useResolved();
  const c = r.color;
  const { dark } = useAppearance();
  const reduced = useReducedMotion();
  return {
    c,
    r,
    base: {
      ...(reduced ? { animate: false as const } : {}),
      theme: { type: dark ? 'classicDark' : 'classic', view: { viewFill: 'transparent' } },
      autoFit: true,
      axis: {
        x: { labelFill: c.text.muted, lineStroke: c.line.base, tickStroke: c.line.base, labelAutoRotate: false, labelAutoHide: true },
        y: { labelFill: c.text.muted, gridStroke: c.line.hairline, gridLineDash: [0, 0] },
      },
      legend: { color: { itemLabelFill: c.text.base, position: 'top' as const, layout: { justifyContent: 'flex-start' } } },
    },
  };
}

/** Planned against actual value of work, cumulative %, month by month. */
export function SCurveChart({ data }: { data: HomeTrendsDto['sCurve'] }) {
  const { c, base } = useChartTheme();
  const rows = data.flatMap((d) => [
    { month: monthLabel(d.month), series: 'Planned', pct: d.planned },
    ...(d.actual === null ? [] : [{ month: monthLabel(d.month), series: 'Actual', pct: d.actual }]),
  ]);
  return (
    <Line
      {...base}
      height={280}
      data={rows}
      xField="month"
      yField="pct"
      colorField="series"
      scale={{ color: { domain: ['Planned', 'Actual'], range: [c.text.faint, c.accent.solid] }, y: { domainMin: 0 } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => formatPct(v) } }}
      style={{ lineWidth: 2.5, lineDash: (d: { series: string }[]) => (d[0]?.series === 'Planned' ? [6, 4] : [0, 0]) }}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => formatPct(v) }}
    />
  );
}

/** A project's planned value, earned value and actual cost, cumulative by month. */
export function EarnedValueChart({ data }: { data: EarnedValuePointDto[] }) {
  const { c, base } = useChartTheme();
  const series = ['Planned value', 'Earned value', 'Actual cost'] as const;
  const rows = data.flatMap((d) => [
    { month: monthLabel(d.month), series: series[0], amount: toNumber(d.pv) },
    ...(d.ev === null ? [] : [{ month: monthLabel(d.month), series: series[1], amount: toNumber(d.ev) }]),
    ...(d.ac === null ? [] : [{ month: monthLabel(d.month), series: series[2], amount: toNumber(d.ac) }]),
  ]);
  return (
    <Line
      {...base}
      height={300}
      data={rows}
      xField="month"
      yField="amount"
      colorField="series"
      scale={{ color: { domain: [...series], range: [c.text.faint, c.accent.solid, c.text.base] }, y: { domainMin: 0 } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => formatINRCompact(v).replace(RUPEE, '₹') } }}
      style={{ lineWidth: 2.5, lineDash: (d: { series: string }[]) => (d[0]?.series === series[0] ? [6, 4] : [0, 0]) }}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => formatINRCompact(v) }}
    />
  );
}

/** The 13-week cash forecast: the balance at each week's end, likely with its low and high case. */
export function CashForecastChart({ weeks }: { weeks: CashWeekDto[] }) {
  const { c, base } = useChartTheme();
  const series = ['Low', 'Likely', 'High'] as const;
  const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const rows = weeks.flatMap((w) => [
    { week: label(w.start), series: series[0], amount: w.closing.low },
    { week: label(w.start), series: series[1], amount: w.closing.likely },
    { week: label(w.start), series: series[2], amount: w.closing.high },
  ]);
  return (
    <Line
      {...base}
      height={300}
      data={rows}
      xField="week"
      yField="amount"
      colorField="series"
      scale={{ color: { domain: [...series], range: [c.text.faint, c.accent.solid, c.text.faint] }, y: { nice: true } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => formatINRCompact(v).replace(RUPEE, '₹') } }}
      style={{ lineWidth: (d: { series: string }[]) => (d[0]?.series === series[1] ? 2.5 : 1.5), lineDash: (d: { series: string }[]) => (d[0]?.series === series[1] ? [0, 0] : [6, 4]) }}
      annotations={[{ type: 'lineY', yField: 0, style: { stroke: c.text.faint, lineWidth: 1 } }]}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => formatINRCompact(v) }}
    />
  );
}

/** Cash in from clients against cash out to vendors, by month. */
export function CashFlowChart({ months, cashIn, cashOut }: { months: string[]; cashIn?: string[]; cashOut?: string[] }) {
  const { c, base } = useChartTheme();
  const rows = months.flatMap((m, i) => [
    ...(cashIn ? [{ month: monthLabel(m), series: 'Received', amount: toNumber(cashIn[i]) }] : []),
    ...(cashOut ? [{ month: monthLabel(m), series: 'Paid', amount: toNumber(cashOut[i]) }] : []),
  ]);
  return (
    <Column
      {...base}
      height={280}
      data={rows}
      xField="month"
      yField="amount"
      colorField="series"
      group
      scale={{ color: { domain: ['Received', 'Paid'], range: [c.accent.solid, c.text.faint] } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => formatINRCompact(v).replace(RUPEE, '₹') } }}
      style={{ radiusTopLeft: 3, radiusTopRight: 3, maxWidth: 28 }}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => formatINRCompact(v) }}
    />
  );
}

/** Cost of the six months by head, as a ring with the total in the middle. */
export function CostByHeadChart({ heads }: { heads: CostHeadsDto }) {
  const { c, r, base } = useChartTheme();
  // Beside the ring on wider screens; below it on a phone, where the side would squeeze the ring.
  const side = Grid.useBreakpoint().md !== false;
  const rows = COST_HEADS.map(([k, label]) => ({ head: label, amount: toNumber(heads[k]) })).filter((r) => r.amount > 0);
  return (
    <Pie
      theme={base.theme}
      {...(base.animate === false ? { animate: false as const } : {})}
      autoFit
      height={280}
      data={rows}
      angleField="amount"
      colorField="head"
      innerRadius={0.78}
      scale={{ color: { domain: COST_HEADS.map(([, l]) => l), range: COST_HEADS.map(([k]) => c.series.cost[k]) } }}
      legend={{ color: { itemLabelFill: c.text.base, position: side ? ('right' as const) : ('bottom' as const) } }}
      label={false}
      tooltip={{ field: 'amount', valueFormatter: (v: number) => formatINRCompact(v) }}
      annotations={[
        {
          type: 'text',
          style: { text: formatINRCompact(heads.total), x: '50%', y: '50%', textAlign: 'center', fontSize: r.type.subhead.size, fontWeight: r.type.subhead.weight, fill: c.text.base },
        },
      ]}
    />
  );
}
