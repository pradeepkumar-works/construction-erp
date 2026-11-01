'use client';

import React from 'react';
import { Descriptions, Table, Typography } from 'antd';
import { OM_BENCHMARK_INFO, type OmBillDto } from '@erp/shared';
import { formatDate, formatINR, formatMonth, formatPct } from '@/lib/format';
import { Section } from '@/components/common/Section';

type StaffLine = OmBillDto['staff'][number];
type PenaltyLine = OmBillDto['penalties'][number];

/**
 * What an O&M bill bills: its period's instalment, the staff short of the minimum taken off it, and the
 * service level penalties deducted, month by month, as the bill was priced.
 */
export function OmBillSection({ om }: { om: OmBillDto }) {
  return (
    <>
      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2, lg: 3 }}
        items={[
          { key: 'p', label: 'Period', children: <span translate="no">{`${om.label}: ${formatDate(om.from)} to ${formatDate(om.to)}`}</span>, span: 2 },
          { key: 'y', label: 'Year’s share', children: <span translate="no">{`${formatPct(om.yearPct, { digits: 2 })} of the contract`}</span> },
          { key: 'i', label: 'Instalment', children: <span translate="no">{formatINR(om.instalmentAmount, true)}</span> },
          { key: 's', label: 'Staff short', children: <span translate="no">{`− ${formatINR(om.staffDeduction, true)}`}</span> },
          { key: 'n', label: 'Service level penalties', children: <span translate="no">{`− ${formatINR(om.penalty, true)} (in deductions)`}</span> },
        ]}
      />
      {om.missingDays || om.staffNotRecorded.length ? (
        <p>
          <Typography.Text type="warning">
            {[
              om.missingDays ? `${om.missingDays} ${om.missingDays === 1 ? 'day' : 'days'} of the period had no service level reading.` : null,
              om.staffNotRecorded.length ? `Staff were not recorded for ${om.staffNotRecorded.map(formatMonth).join(', ')}.` : null,
            ]
              .filter(Boolean)
              .join(' ')}
          </Typography.Text>
        </p>
      ) : null}
      {om.staff.length ? (
        <Section title="Staff short of the minimum">
          <Table<StaffLine>
            size="small"
            rowKey={(l) => `${l.month}-${l.role}`}
            pagination={false}
            dataSource={om.staff}
            scroll={{ x: 560 }}
            columns={[
              { key: 'm', title: 'Month', width: 100, render: (_, l) => <span translate="no">{formatMonth(l.month)}</span> },
              { key: 'r', title: 'Role', render: (_, l) => l.role },
              { key: 'd', title: 'Deployed of minimum', width: 160, align: 'right', render: (_, l) => <span translate="no">{`${l.deployed} of ${l.required}`}</span> },
              { key: 'x', title: 'Deducted', width: 130, align: 'right', render: (_, l) => <span translate="no">{formatINR(l.deduction, true)}</span> },
            ]}
          />
        </Section>
      ) : null}
      {om.penalties.length ? (
        <Section title="Service level penalties">
          <Table<PenaltyLine>
            size="small"
            rowKey={(p) => `${p.month}-${p.key}`}
            pagination={false}
            dataSource={om.penalties}
            scroll={{ x: 560 }}
            columns={[
              { key: 'm', title: 'Month', width: 100, render: (_, p) => <span translate="no">{formatMonth(p.month)}</span> },
              { key: 'b', title: 'Benchmark', render: (_, p) => OM_BENCHMARK_INFO[p.key].label },
              { key: 'f', title: 'Failures (allowed)', width: 150, align: 'right', render: (_, p) => <span translate="no">{`${p.failures} (${p.allowed})`}</span> },
              { key: 'a', title: 'Penalty', width: 130, align: 'right', render: (_, p) => <span translate="no">{formatINR(p.amount, true)}</span> },
            ]}
          />
        </Section>
      ) : (
        <Typography.Text type="secondary">No service level penalties in this period.</Typography.Text>
      )}
    </>
  );
}
