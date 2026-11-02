'use client';

import React from 'react';
import { Column } from '@ant-design/plots';
import type { PortfolioMonthDto } from '@erp/shared';
import { formatINRCompact, toNumber, RUPEE } from '@/lib/format';
import { useChartTheme } from '@/components/home/charts';
import { monthLabel } from '@/components/home/chartData';

const SERIES = ['Billed', 'Received', 'Cost'] as const;

/** Billed, received and cost by month, as grouped columns (money in a month is a flow, so bars rather than a line). */
export function TrendChart({ months }: { months: PortfolioMonthDto[] }) {
  const { base, c } = useChartTheme();
  /** The trend's three colours, in the order of `SERIES`, checked for colour-blind readers in both themes. */
  const colors = [c.series.trend.billed, c.series.trend.received, c.series.trend.cost];
  const rows = months.flatMap((m) => [
    {
      month: monthLabel(m.month),
      series: SERIES[0],
      amount: toNumber(m.billed),
    },
    {
      month: monthLabel(m.month),
      series: SERIES[1],
      amount: toNumber(m.received),
    },
    { month: monthLabel(m.month), series: SERIES[2], amount: toNumber(m.cost) },
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
      scale={{ color: { domain: [...SERIES], range: colors } }}
      axis={{
        ...base.axis,
        y: {
          ...base.axis.y,
          labelFormatter: (v: number) => formatINRCompact(v).replace(RUPEE, '₹'),
        },
      }}
      style={{
        radiusTopLeft: 4,
        radiusTopRight: 4,
        maxWidth: 14,
        stroke: c.surface.base,
        lineWidth: 1,
      }}
      tooltip={{
        channel: 'y',
        valueFormatter: (v: number) => formatINRCompact(v),
      }}
    />
  );
}
