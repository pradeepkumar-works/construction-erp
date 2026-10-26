'use client';

import React from 'react';
import { Column } from '@ant-design/plots';
import type { PortfolioMonthDto } from '@erp/shared';
import { useAppearance } from '@/lib/appearance';
import { BRAND } from '@/lib/brand';
import { formatINRCompact, toNumber, RUPEE } from '@/lib/format';
import { useChartTheme } from '@/components/home/charts';
import { monthLabel } from '@/components/home/chartData';

const SERIES = ['Billed', 'Received', 'Cost'] as const;

/** The trend's three colours, in a fixed order, for the theme (validated in both; see `BRAND.colors.trend…`). */
function useTrendColors() {
  const { dark } = useAppearance();
  const c = BRAND.colors;
  return dark ? [c.trendBilledNight, c.trendReceivedNight, c.trendCostNight] : [c.trendBilled, c.trendReceived, c.trendCost];
}

/** Billed, received and cost by month, as grouped columns (money in a month is a flow, so bars rather than a line). */
export function TrendChart({ months }: { months: PortfolioMonthDto[] }) {
  const { base, token } = useChartTheme();
  const colors = useTrendColors();
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
        stroke: token.colorBgContainer,
        lineWidth: 1,
      }}
      tooltip={{
        channel: 'y',
        valueFormatter: (v: number) => formatINRCompact(v),
      }}
    />
  );
}
