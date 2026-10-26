'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Table, Typography, theme } from 'antd';
import type { TableColumnsType } from 'antd';
import { HEALTH_LABELS, PORTFOLIO_SCHEDULE_LABELS, type HealthLevel, type PortfolioProjectDto } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { formatINRCompact, formatPct, toNumber } from '@/lib/format';
import { ScheduleBullet } from './MoneyPipeline';
import { HEALTH_TONES } from './report-format';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const RANK: Record<HealthLevel, number> = { act: 0, watch: 1, good: 2 };
export const byHealth = (a: PortfolioProjectDto, b: PortfolioProjectDto) => RANK[a.health] - RANK[b.health] || a.code.localeCompare(b.code);

/** Every contract project on one row each: health, progress against plan, and its money from contract to what clients owe. */
export function ProjectsHealthTable({ projects }: { projects: PortfolioProjectDto[] }) {
  const { token } = theme.useToken();
  const router = useRouter();
  const money = (v: string | null) => (
    <span className="mono" translate="no" style={{ whiteSpace: 'nowrap' }}>
      {v === null ? '–' : formatINRCompact(v)}
    </span>
  );
  const sub = (children: React.ReactNode, danger = false, wrap = false) => (
    <div
      style={{
        fontSize: token.fontSizeSM,
        color: danger ? token.colorErrorText : token.colorTextSecondary,
        whiteSpace: wrap ? undefined : 'nowrap',
      }}
    >
      {children}
    </div>
  );
  const columns: TableColumnsType<PortfolioProjectDto> = [
    {
      key: 'project',
      title: 'Project',
      fixed: 'left',
      width: 210,
      render: (_, p) => (
        <div style={{ minWidth: 0 }}>
          <Link href={`/management/projects/${p.projectId}`} onClick={(e) => e.stopPropagation()} translate="no" style={{ fontWeight: token.fontWeightStrong }}>
            {p.code}
          </Link>
          <Typography.Text
            type="secondary"
            ellipsis={{ tooltip: p.name }}
            translate="no"
            style={{
              display: 'block',
              fontSize: token.fontSizeSM,
              maxWidth: 190,
            }}
          >
            {p.name}
          </Typography.Text>
        </div>
      ),
    },
    {
      key: 'health',
      title: 'Health',
      render: (_, p) => (
        <AppTag tone={HEALTH_TONES[p.health]} title={p.reasons.map((r) => r.text).join('; ') || undefined}>
          {HEALTH_LABELS[p.health]}
        </AppTag>
      ),
    },
    {
      key: 'progress',
      title: 'Progress against plan',
      width: 170,
      render: (_, p) => {
        const s = p.schedule;
        const words = `${formatPct(s.done)} done${s.planned !== null ? `, ${formatPct(s.planned)} planned by today` : ''}`;
        return (
          <div>
            <ScheduleBullet done={s.done} planned={s.planned} label={words} />
            {sub(
              <>
                <span translate="no">{formatPct(s.done)}</span>
                {s.planned !== null ? (
                  <>
                    {' '}
                    of <span translate="no">{formatPct(s.planned)}</span> planned
                  </>
                ) : null}
                {s.state === 'BEHIND' || s.state === 'LATE' ? `, ${PORTFOLIO_SCHEDULE_LABELS[s.state].toLowerCase()}` : ''}
              </>,
              s.state === 'LATE',
              true,
            )}
          </div>
        );
      },
    },
    {
      key: 'contract',
      title: 'Contract',
      align: 'right',
      render: (_, p) => money(p.money.contractValue),
    },
    {
      key: 'done',
      title: 'Work done',
      align: 'right',
      render: (_, p) => money(p.money.workDone),
    },
    {
      key: 'billed',
      title: 'Billed',
      align: 'right',
      render: (_, p) => money(p.money.billed),
    },
    {
      key: 'unbilled',
      title: 'Not billed',
      align: 'right',
      render: (_, p) => (
        <>
          {money(p.money.unbilled)}
          {p.money.unbilledDays !== null && toNumber(p.money.unbilled) > 0
            ? sub(
                days(p.money.unbilledDays),
                p.reasons.some((r) => r.key === 'billing' && r.level === 'act'),
              )
            : null}
        </>
      ),
    },
    {
      key: 'owe',
      title: 'Client owes',
      align: 'right',
      render: (_, p) => (
        <>
          {money(p.money.outstanding)}
          {toNumber(p.money.over90) > 0
            ? sub(
                <>
                  <span translate="no">{formatINRCompact(p.money.over90)}</span> over 90 days
                </>,
                true,
              )
            : null}
        </>
      ),
    },
    {
      key: 'cost',
      title: 'Cost',
      align: 'right',
      render: (_, p) => (
        <>
          {money(p.money.cost)}
          {p.money.budget !== null
            ? sub(
                <>
                  of <span translate="no">{formatINRCompact(p.money.budget)}</span>
                </>,
              )
            : null}
        </>
      ),
    },
    {
      key: 'margin',
      title: 'Margin',
      align: 'right',
      render: (_, p) => (
        <span
          className="mono"
          translate="no"
          style={{
            color: p.money.marginPct !== null && p.money.marginPct < 0 ? token.colorErrorText : undefined,
          }}
        >
          {formatPct(p.money.marginPct)}
        </span>
      ),
    },
    {
      key: 'waiting',
      title: 'Waiting',
      align: 'right',
      render: (_, p) => (
        <>
          <span className="mono">{p.approvals.waiting}</span>
          {p.approvals.oldestDays && p.approvals.oldestDays > 2
            ? sub(
                days(p.approvals.oldestDays),
                p.reasons.some((r) => r.key === 'approvals' && r.level === 'act'),
              )
            : null}
        </>
      ),
    },
  ];
  return (
    <Table<PortfolioProjectDto>
      size="middle"
      rowKey="projectId"
      dataSource={[...projects].sort(byHealth)}
      columns={columns}
      pagination={false}
      scroll={{ x: 1100 }}
      rowClassName={() => 'row-click'}
      onRow={(p) => ({ onClick: () => router.push(`/management/projects/${p.projectId}`) })}
      locale={{ emptyText: 'No contract projects yet.' }}
    />
  );
}
