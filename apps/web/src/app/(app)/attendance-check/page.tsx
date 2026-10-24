'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, DatePicker, Empty, Flex, Result, Segmented, Statistic, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ATTENDANCE_FLAG_LABELS,
  canSeeAttendanceCheck,
  type AttendanceBillDto,
  type AttendanceBillLineDto,
  type AttendanceCheckDayDto,
  type AttendanceFlagDto,
  type AttendanceFlagKind,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useAttendanceCheck } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact, formatQty } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

const KIND_COLOR: Record<AttendanceFlagKind, string> = { BILL_ABOVE: 'red', NO_PUNCH: 'volcano', HEADCOUNT_ABOVE: 'orange', DPR_GAP: 'blue' };
type BillRow = AttendanceBillLineDto & { bill: AttendanceBillDto; first: boolean };

/**
 * Attendance cross-check (AI item 124): labour contractors' man-day bills against the head count, the named roll call and
 * the biometric punches, and each day's records against each other and the DPR. Flags carry their working; workers are
 * named only to HR and the project manager. The month is in the URL (`?month=YYYY-MM`), the project is the header's.
 */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="list" />}>
      <AttendanceCheck />
    </Suspense>
  );
}

function AttendanceCheck() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const month = /^\d{4}-\d{2}$/.test(search.get('month') ?? '') ? search.get('month')! : dayjs().format('YYYY-MM');
  const allowed = !!user && canSeeAttendanceCheck(user.roleKey);
  const [projectId] = useProjectScope(search.get('projectId') ?? undefined);
  const { data, isLoading, error, refetch } = useAttendanceCheck(month, projectId, allowed);
  const [kind, setKind] = useState<AttendanceFlagKind | 'ALL'>('ALL');
  const [why, setWhy] = useState<Set<string>>(new Set());

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Attendance cross-check" />
        <Result status="403" title="The attendance cross-check is for HR and those who approve site work" />
      </div>
    );
  if (!user || (isLoading && !data)) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const setMonth = (m: string) => {
    const q = new URLSearchParams(search.toString());
    if (m === dayjs().format('YYYY-MM')) q.delete('month');
    else q.set('month', m);
    router.replace(q.size ? `${pathname}?${q}` : pathname);
  };
  const toggleWhy = (key: string) =>
    setWhy((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const kinds = [...new Set(data.flags.map((f) => f.kind))];
  const shown = data.flags.filter((f) => kind === 'ALL' || f.kind === kind);
  const above = data.bills.reduce((t, b) => t + b.excessInr, 0);
  const billed = data.bills.reduce((t, b) => t + b.lines.reduce((s, l) => s + l.billed, 0), 0);
  const flaggedBills = data.bills.filter((b) => b.lines.some((l) => l.flagged)).length;
  const dayFlags = data.flags.filter((f) => f.kind !== 'BILL_ABOVE').length;
  const running = data.month === dayjs().format('YYYY-MM');
  const big = { content: { fontSize: token.fontSizeHeading4 } };
  const rows: BillRow[] = data.bills.flatMap((b) => b.lines.map((l, i) => ({ ...l, bill: b, first: i === 0 })));
  const figure = (v: number | null, missing = 'Not kept') => (v === null ? <Typography.Text type="secondary">{missing}</Typography.Text> : <span className="mono" translate="no">{formatQty(v)}</span>);

  const card = (f: AttendanceFlagDto) => {
    const open = why.has(f.key);
    const id = `working-${f.key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    return (
      <Card key={f.key} data-flag-key={f.key} size="small">
        <Flex gap={token.marginXS} wrap align="center" style={{ marginBottom: token.marginXS }}>
          <AppTag color={KIND_COLOR[f.kind]}>{ATTENDANCE_FLAG_LABELS[f.kind]}</AppTag>
          <Typography.Text type="secondary" translate="no">
            {f.projectName}
          </Typography.Text>
          <Typography.Text type="secondary">{f.from === f.to ? formatDate(f.from) : `${formatDate(f.from)} to ${formatDate(f.to)}`}</Typography.Text>
        </Flex>
        <Typography.Title level={3} style={{ fontSize: token.fontSizeHeading5, marginTop: 0, marginBottom: token.marginXS }}>
          {f.title}
        </Typography.Title>
        <Flex gap={token.marginXS} wrap align="baseline" style={{ marginBottom: token.marginXS }}>
          <Typography.Text strong>To check:</Typography.Text>
          <Typography.Text translate="no">{f.quantity}</Typography.Text>
          {f.valueInr ? (
            <AppTag tone="danger" translate="no">
              {formatINR(f.valueInr)}
            </AppTag>
          ) : null}
        </Flex>
        <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginXS }}>
          {f.detail}
        </Typography.Paragraph>
        {f.workers?.length ? (
          <Typography.Paragraph style={{ marginBottom: token.marginXS }}>
            <Typography.Text strong>Workers: </Typography.Text>
            <span translate="no">{f.workers.map((w) => `${w.name} (${w.workerNo})`).join(', ')}</span>
          </Typography.Paragraph>
        ) : null}
        <Button type="link" size="small" icon={open ? <UpOutlined /> : <DownOutlined />} aria-expanded={open} aria-controls={id} onClick={() => toggleWhy(f.key)} style={{ paddingInline: 0 }}>
          Why: the working
        </Button>
        {open ? (
          <ol id={id} style={{ margin: `${token.marginXS}px 0 0`, paddingInlineStart: token.paddingLG }} translate="no">
            {f.working.map((line, i) => (
              <li key={i}>
                <Typography.Text>{line}</Typography.Text>
              </li>
            ))}
          </ol>
        ) : null}
        <Flex gap={token.margin} wrap className="link-row" style={{ marginTop: token.marginSM }}>
          {f.links.map((l) => (
            <Link key={l.href + l.label} href={l.href}>
              {l.label}
            </Link>
          ))}
        </Flex>
      </Card>
    );
  };

  const section = (title: string, children: React.ReactNode, note?: string) => (
    <section style={{ marginTop: token.marginLG }}>
      <Typography.Title level={2} style={{ fontSize: token.fontSizeHeading4, marginBottom: note ? token.marginXXS : token.marginSM }}>
        {title}
      </Typography.Title>
      {note ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginSM }}>
          {note}
        </Typography.Paragraph>
      ) : null}
      {children}
    </section>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Attendance cross-check"
        subtitle={`What labour contractors bill in man-days against the head count, the roll call and the biometric punches, ${formatDate(data.from)} to ${formatDate(data.to)}${running ? ' (so far)' : ''}. A flag is a reason to check the muster; nobody's wage is held or cut by it.`}
      />
      <Flex wrap gap={token.marginSM} align="center" style={{ marginBottom: token.margin }}>
        <DatePicker
          picker="month"
          format="MMM YYYY"
          allowClear={false}
          aria-label="Month"
          value={dayjs(`${month}-01`)}
          disabledDate={(d) => d.isAfter(dayjs(), 'month')}
          onChange={(d) => d && setMonth(d.format('YYYY-MM'))}
        />
        {kinds.length > 1 ? (
          <Segmented
            aria-label="Kind of flag"
            style={{ maxWidth: '100%', overflowX: 'auto' }}
            value={kind}
            onChange={(v) => setKind(v as AttendanceFlagKind | 'ALL')}
            options={[{ value: 'ALL', label: `All (${data.flags.length})` }, ...kinds.map((k) => ({ value: k, label: `${ATTENDANCE_FLAG_LABELS[k]} (${data.flags.filter((f) => f.kind === k).length})` }))]}
          />
        ) : null}
      </Flex>

      <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Billed above the records" value={0} formatter={() => <span translate="no">{formatINRCompact(above)}</span>} styles={big} />
          <Typography.Text type="secondary">
            {flaggedBills === 1 ? '1 bill' : `${flaggedBills} bills`} of {data.bills.length === 1 ? '1 man-day bill' : `${data.bills.length} man-day bills`}
          </Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Man-days billed" value={0} formatter={() => <span translate="no">{formatQty(billed)}</span>} styles={big} />
          <Typography.Text type="secondary">On labour bills measured up to a day this month</Typography.Text>
        </Card>
        <Card size="small" style={{ flex: '1 1 180px' }}>
          <Statistic title="Days to check" value={dayFlags} styles={big} />
          <Typography.Text type="secondary">Unpunched workers, head counts above the roll call or the DPR</Typography.Text>
        </Card>
      </Flex>

      {section(
        data.flags.length === 1 ? '1 thing to check' : `${data.flags.length} things to check`,
        shown.length ? (
          <Flex vertical gap={token.marginSM}>
            {shown.map(card)}
          </Flex>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.flags.length ? 'Nothing of this kind this month.' : 'Nothing to check this month: the bills and the days agree with the records.'} />
        ),
      )}

      {section(
        'Man-day bills',
        rows.length ? (
          <Table<BillRow>
            size="small"
            rowKey="lineId"
            dataSource={rows}
            pagination={false}
            scroll={{ x: 900 }}
            columns={[
              {
                title: 'Bill',
                key: 'bill',
                width: 220,
                render: (_, r) =>
                  r.first ? (
                    <div>
                      <Link href={`/subcontract-bills/${r.bill.billId}`}>{r.bill.label}</Link>
                      <div>
                        <Typography.Text type="secondary" translate="no">
                          {r.bill.vendorName}
                        </Typography.Text>
                      </div>
                      <Typography.Text type="secondary">
                        {formatDate(r.bill.from)} to {formatDate(r.bill.to)}
                      </Typography.Text>
                    </div>
                  ) : null,
              },
              { title: 'Line', dataIndex: 'description', key: 'description' },
              { title: 'Billed', key: 'billed', align: 'right', width: 90, render: (_, r) => <strong className="mono" translate="no">{formatQty(r.billed)}</strong> },
              { title: 'Head count', key: 'head', align: 'right', width: 110, render: (_, r) => figure(r.sources.headCount) },
              { title: 'Roll call', key: 'roll', align: 'right', width: 100, render: (_, r) => figure(r.sources.rollCall) },
              { title: 'Punched', key: 'punched', align: 'right', width: 100, render: (_, r) => figure(r.sources.punched, 'No device') },
              {
                title: 'Above the records',
                key: 'above',
                align: 'right',
                width: 160,
                render: (_, r) =>
                  r.flagged ? (
                    <Typography.Text type="danger" className="mono" translate="no">
                      {formatQty(r.excess)} · {formatINR(r.excessInr)}
                    </Typography.Text>
                  ) : (
                    <Typography.Text type="secondary">Within</Typography.Text>
                  ),
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No subcontractor bill this month is billed in man-days." />
        ),
        'Each labour line over the days its bill covers. What the records support is the higher of the head count and the roll call; punches are the part of the roll call the device saw.',
      )}

      {section(
        'Each day',
        projectId ? (
          <Table<AttendanceCheckDayDto>
            size="small"
            rowKey="date"
            dataSource={data.days.filter((d) => d.dpr !== null || d.headCount !== null || d.rollCall !== null || d.deviceUp)}
            locale={{ emptyText: 'Nothing recorded at this site this month.' }}
            pagination={false}
            scroll={{ x: 640, y: 420 }}
            columns={[
              { title: 'Day', dataIndex: 'date', key: 'date', width: 110, render: (v: string) => formatDate(v) },
              { title: 'DPR manpower', key: 'dpr', align: 'right', render: (_, d) => figure(d.dpr, 'No DPR') },
              { title: 'Head count', key: 'head', align: 'right', render: (_, d) => figure(d.headCount, 'No sheet') },
              { title: 'Roll call', key: 'roll', align: 'right', render: (_, d) => figure(d.rollCall, 'Not kept') },
              {
                title: 'Punched',
                key: 'punched',
                align: 'right',
                render: (_, d) => (d.punched === null ? <Typography.Text type="secondary">No device</Typography.Text> : d.deviceUp ? figure(d.punched) : <Typography.Text type="secondary">Device silent</Typography.Text>),
              },
            ]}
          />
        ) : (
          <Typography.Paragraph type="secondary">Choose a project in the header to see each day&apos;s DPR, head count, roll call and punches side by side.</Typography.Paragraph>
        ),
      )}
    </div>
  );
}
