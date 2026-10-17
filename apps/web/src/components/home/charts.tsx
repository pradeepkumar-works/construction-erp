'use client';

import React from 'react';
import { Grid, theme } from 'antd';
import { Column, Line, Pie } from '@ant-design/plots';
import type { CostHeadsDto, HomeTrendsDto } from '@erp/shared';
import { useAppearance, useReducedMotion } from '@/lib/appearance';
import { formatINRCompact, toNumber } from '@/lib/format';
import { COST_HEADS, monthLabel } from './chartData';

/**
 * The home page's charts (UI roadmap item 59), drawn with @ant-design/plots and coloured from the antd tokens, so light
 * and dark follow the user's appearance. This module is only loaded by the pages that draw a chart. They draw without
 * animating when the system asks for less motion; the summary and the table view are `ChartCard`'s (UX item 81).
 */

function useChartTheme() {
  const { token } = theme.useToken();
  const { dark } = useAppearance();
  const reduced = useReducedMotion();
  return {
    token,
    base: {
      ...(reduced ? { animate: false as const } : {}),
      theme: { type: dark ? 'classicDark' : 'classic', view: { viewFill: 'transparent' } },
      autoFit: true,
      axis: {
        x: { labelFill: token.colorTextSecondary, lineStroke: token.colorBorder, tickStroke: token.colorBorder, labelAutoRotate: false, labelAutoHide: true },
        y: { labelFill: token.colorTextSecondary, gridStroke: token.colorSplit, gridLineDash: [0, 0] },
      },
      legend: { color: { itemLabelFill: token.colorText, position: 'top' as const, layout: { justifyContent: 'flex-start' } } },
    },
  };
}

/** Planned against actual value of work, cumulative %, month by month. */
export function SCurveChart({ data }: { data: HomeTrendsDto['sCurve'] }) {
  const { token, base } = useChartTheme();
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
      scale={{ color: { domain: ['Planned', 'Actual'], range: [token.colorTextQuaternary, token.colorPrimary] }, y: { domainMin: 0 } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => `${v}%` } }}
      style={{ lineWidth: 2.5, lineDash: (d: { series: string }[]) => (d[0]?.series === 'Planned' ? [6, 4] : [0, 0]) }}
      point={{ shapeField: 'circle', sizeField: 2 }}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => `${v}%` }}
    />
  );
}

/** Cash in from clients against cash out to vendors, by month. */
export function CashFlowChart({ months, cashIn, cashOut }: { months: string[]; cashIn?: string[]; cashOut?: string[] }) {
  const { token, base } = useChartTheme();
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
      scale={{ color: { domain: ['Received', 'Paid'], range: [token.colorSuccess, token.colorWarning] } }}
      axis={{ ...base.axis, y: { ...base.axis.y, labelFormatter: (v: number) => formatINRCompact(v).replace('₹ ', '₹') } }}
      style={{ radiusTopLeft: 3, radiusTopRight: 3, maxWidth: 28 }}
      tooltip={{ channel: 'y', valueFormatter: (v: number) => formatINRCompact(v) }}
    />
  );
}

/** Cost of the six months by head, as a ring with the total in the middle. */
export function CostByHeadChart({ heads }: { heads: CostHeadsDto }) {
  const { token, base } = useChartTheme();
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
      innerRadius={0.62}
      scale={{ color: { domain: COST_HEADS.map(([, l]) => l), range: [token.blue, token.purple, token.gold, token.cyan, token.magenta] } }}
      legend={{ color: { itemLabelFill: token.colorText, position: side ? ('right' as const) : ('bottom' as const) } }}
      label={false}
      tooltip={{ field: 'amount', valueFormatter: (v: number) => formatINRCompact(v) }}
      annotations={[
        {
          type: 'text',
          style: { text: formatINRCompact(heads.total), x: '50%', y: '50%', textAlign: 'center', fontSize: token.fontSizeHeading4, fontWeight: 600, fill: token.colorText },
        },
      ]}
    />
  );
}
