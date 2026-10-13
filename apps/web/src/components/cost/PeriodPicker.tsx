'use client';

import React from 'react';
import { DatePicker, Segmented, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CostPeriod } from '@/lib/queries';

export type PeriodPreset = 'month' | 'quarter' | 'fy' | 'all' | 'custom';

export interface PeriodState {
  preset: PeriodPreset;
  range: [Dayjs | null, Dayjs | null] | null;
}

export const DEFAULT_PERIOD: PeriodState = { preset: 'month', range: null };

/** Indian financial year starting 1 April. */
const fyStart = (d: Dayjs) => (d.month() >= 3 ? d.month(3).startOf('month') : d.subtract(1, 'year').month(3).startOf('month'));

export function periodParams(p: PeriodState): CostPeriod {
  const now = dayjs();
  const f = (d: Dayjs) => d.format('YYYY-MM-DD');
  switch (p.preset) {
    case 'month':
      return { from: f(now.startOf('month')), to: f(now) };
    case 'quarter':
      return { from: f(now.subtract(2, 'month').startOf('month')), to: f(now) };
    case 'fy':
      return { from: f(fyStart(now)), to: f(now) };
    case 'all':
      return {};
    default:
      return { from: p.range?.[0] ? f(p.range[0]) : undefined, to: p.range?.[1] ? f(p.range[1]) : undefined };
  }
}

export function periodLabel(p: PeriodState): string {
  const q = periodParams(p);
  if (!q.from && !q.to) return 'since the start';
  const fmt = (s?: string) => (s ? dayjs(s).format('D MMM YYYY') : '…');
  return `${fmt(q.from)} to ${fmt(q.to)}`;
}

export function PeriodPicker({ value, onChange }: { value: PeriodState; onChange: (v: PeriodState) => void }) {
  return (
    <Space wrap>
      <Segmented
        value={value.preset}
        onChange={(v) => onChange({ preset: v as PeriodPreset, range: value.range })}
        options={[
          { value: 'month', label: 'This month' },
          { value: 'quarter', label: 'Last 3 months' },
          { value: 'fy', label: 'This FY' },
          { value: 'all', label: 'All time' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {value.preset === 'custom' ? (
        <DatePicker.RangePicker value={value.range} onChange={(r) => onChange({ preset: 'custom', range: r as [Dayjs | null, Dayjs | null] | null })} format="DD MMM YYYY" allowEmpty={[true, true]} />
      ) : null}
    </Space>
  );
}
