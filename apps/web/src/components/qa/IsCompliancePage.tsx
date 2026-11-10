'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import dayjs, { type Dayjs } from 'dayjs';
import { Card, Flex, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { IS_DISCIPLINE_LABELS, figure, isStandardLabel, type ComplianceCount, type StandardCompliance } from '@erp/shared';
import { useIsCompliance } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { rangePresets } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { Section } from '@/components/common/Section';
import { Figures } from '@/components/figures';

type Row = ComplianceCount & { key: string; name: React.ReactNode; note?: string };

const n = (v: number) => <span translate="no">{v}</span>;

/** Passed, failed, waiting and the pass rate: the columns every compliance table shares. */
const countColumns = [
  { title: 'Passed', key: 'passed', width: 90, align: 'right' as const, render: (_: unknown, r: Row) => n(r.passed) },
  { title: 'Failed', key: 'failed', width: 90, align: 'right' as const, render: (_: unknown, r: Row) => <span translate="no" style={r.failed ? { color: tk.color.tone.danger.fg, fontWeight: tk.type.strong.fontWeight } : undefined}>{r.failed}</span> },
  { title: 'Waiting', key: 'waiting', width: 90, align: 'right' as const, render: (_: unknown, r: Row) => n(r.waiting) },
  { title: 'Pass rate', key: 'rate', width: 100, align: 'right' as const, render: (_: unknown, r: Row) => <span translate="no">{r.passRate === null ? '-' : `${r.passRate}%`}</span> },
];

function CountTable({ rows, label, empty }: { rows: Row[]; label: string; empty: string }) {
  return (
    <Table<Row>
      rowKey="key"
      size="middle"
      aria-label={label}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 560 }}
      locale={{ emptyText: empty }}
      columns={[
        {
          title: label,
          key: 'name',
          render: (_, r) => (
            <Flex vertical gap={2}>
              {r.name}
              {r.note ? <Typography.Text type="secondary">{r.note}</Typography.Text> : null}
            </Flex>
          ),
        },
        ...countColumns,
      ]}
    />
  );
}

/** Compliance with the Indian Standards: tests in the period by discipline and by standard, against the library. */
export function IsCompliancePage() {
  const [projectId, setProjectId] = useProjectScope();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const { data, isLoading, error, refetch } = useIsCompliance({ projectId, from: range?.[0].format('YYYY-MM-DD'), to: range?.[1].format('YYYY-MM-DD') });

  const filters = (
    <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
      <DatePicker.RangePicker
        aria-label="Sampled between"
        allowClear={false}
        presets={rangePresets()}
        value={range ?? (data ? [dayjs(data.from), dayjs(data.to)] : null)}
        onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
        disabledDate={(d) => d.isAfter(dayjs(), 'day')}
      />
      <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" style={{ minWidth: 240, maxWidth: '100%' }} />
    </Flex>
  );

  const body = (() => {
    if (isLoading) return <PageSkeleton shape="home" header={false} />;
    if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
    const t = data.totals;
    const figures = [
      figure('testPassRate', t.passRate ?? { none: 'No test with a result yet' }),
      figure('testsFailed', t.failed),
      figure('testsWaiting', t.waiting),
      figure('standardsTracked', data.standards),
    ];
    const disciplines: Row[] = [
      ...data.byDiscipline.map((d) => ({ ...d, key: d.discipline, name: <Link href={`/is-standards?discipline=${d.discipline}`}>{IS_DISCIPLINE_LABELS[d.discipline]}</Link> })),
      ...(data.unlinked.passed + data.unlinked.failed + data.unlinked.waiting
        ? [{ ...data.unlinked, key: 'NONE', name: 'Under no standard', note: 'Tests whose test type no tracked clause names' }]
        : []),
    ];
    const standards: Row[] = data.byStandard
      .filter((s) => s.passed + s.failed + s.waiting)
      .sort((a, b) => b.failed - a.failed || b.passed + b.failed + b.waiting - (a.passed + a.failed + a.waiting))
      .map((s: StandardCompliance) => ({
        ...s,
        key: s.code,
        name: (
          <Link href={`/is-standards/${s.code}`} translate="no">
            {isStandardLabel(s)}
          </Link>
        ),
        note: `${IS_DISCIPLINE_LABELS[s.discipline]} · ${s.title}`,
      }));
    return (
      <Flex vertical gap={tk.space[4]}>
        <Figures label="Compliance figures" figures={figures} scope={{ projectId }} />
        <Card>
          <Flex vertical gap={tk.space[6]}>
            <Section title="By discipline">
              <CountTable rows={disciplines} label="Discipline" empty="No test sampled in the period." />
            </Section>
            <Section help={<>A test counts under every standard whose clause names its test, so a cube counts under IS 456 and IS 516. By discipline it counts once. Tests sampled{' '}
                {formatDate(data.from)} to {formatDate(data.to)}.</>} title="By standard">
              <CountTable rows={standards} label="Standard" empty="No test in the period proves a tracked standard." />
            </Section>
          </Flex>
        </Card>
      </Flex>
    );
  })();

  return (
    <div className="page-container">
      <PageHeader title="IS compliance" help="Tests passed and failed by Indian Standard and by discipline: civil, mechanical and electrical." />
      {filters}
      {body}
    </div>
  );
}
