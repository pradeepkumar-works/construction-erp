'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Empty, Flex, Segmented, Statistic, Typography, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { DownOutlined, UpOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { LEAKAGE_SECTION_LABELS, canSeeLeakage, type LeakageFlagDto, type LeakageSection } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLeakage } from '@/lib/queries';
import { formatDate, formatINR, formatINRCompact } from '@/lib/format';
import { useProjectScope } from '@/lib/project-scope';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { NoAccess } from '@/components/common/NoAccess';

const SECTION_COLOR: Record<LeakageSection, string> = { material: 'magenta', rates: 'purple', fuel: 'volcano', idle: 'blue' };
const SECTION_HELP: Record<LeakageSection, string> = {
  material: 'Used against what the approved work allows, and against the other sites',
  rates: 'Orders above what another site paid in the 30 days before',
  fuel: 'Fuel off the norm, or issued with no log that day',
  idle: 'Hired machines paid for hours they did not work',
};

/**
 * Leakage checks (AI item 121): the month's flags where material, money and fuel go missing, with the rupees at risk.
 * Each flag carries its working and links to the records it rests on; the sections are the caller's (`leakageSections`)
 * and the header's project narrows them. The month is in the URL (`?month=YYYY-MM`).
 */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="list" />}>
      <Leakage />
    </Suspense>
  );
}

function Leakage() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const month = /^\d{4}-\d{2}$/.test(search.get('month') ?? '') ? search.get('month')! : dayjs().format('YYYY-MM');
  const allowed = !!user && canSeeLeakage(user.roleKey);
  const { data, isLoading, error, refetch } = useLeakage(month, allowed);
  const [projectId] = useProjectScope();
  const [section, setSection] = useState<LeakageSection | 'ALL'>('ALL');
  const [why, setWhy] = useState<Set<string>>(new Set());

  if (user && !allowed)
    return (
      <div className="page-container">
        <PageHeader title="Leakage checks" />
        <NoAccess title="Leakage checks are for the store, the QS, purchasers, whoever runs the machines, approvers and accounts" />
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

  const inScope = (f: LeakageFlagDto) => !projectId || f.projectId === projectId;
  const scoped = data.flags.filter(inScope);
  const shown = scoped.filter((f) => section === 'ALL' || f.section === section);
  const total = (s: LeakageSection) => (data.totals[s] === null ? null : scoped.filter((f) => f.section === s).reduce((t, f) => t + (f.valueInr ?? 0), 0));
  const known = data.sections.map(total).filter((v): v is number => v !== null);
  const totalInr = known.length ? known.reduce((a, b) => a + b, 0) : null;
  const running = data.month === dayjs().format('YYYY-MM');

  const card = (f: LeakageFlagDto) => {
    const open = why.has(f.key);
    const id = `working-${f.key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
    return (
      <Card key={f.key} data-flag-key={f.key} size="small">
        <Flex gap={token.marginXS} wrap align="center" style={{ marginBottom: token.marginXS }}>
          <AppTag color={SECTION_COLOR[f.section]}>{LEAKAGE_SECTION_LABELS[f.section]}</AppTag>
          {f.projectName ? (
            <Typography.Text type="secondary" translate="no">
              {f.projectName}
            </Typography.Text>
          ) : null}
        </Flex>
        <Typography.Title level={2} style={{ fontSize: token.fontSizeHeading5, marginTop: 0, marginBottom: token.marginXS }}>
          {f.title}
        </Typography.Title>
        <Flex gap={token.marginXS} wrap align="baseline" style={{ marginBottom: token.marginXS }}>
          <Typography.Text strong>At risk:</Typography.Text>
          <Typography.Text translate="no">{f.quantity}</Typography.Text>
          {f.valueInr !== null ? (
            <AppTag tone="danger" translate="no">
              {formatINR(f.valueInr)}
            </AppTag>
          ) : null}
        </Flex>
        <Typography.Paragraph type="secondary" style={{ marginBottom: token.marginXS }}>
          {f.detail}
        </Typography.Paragraph>
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
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </Flex>
      </Card>
    );
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Leakage checks"
        subtitle={`Where material, money and fuel may be going missing, ${formatDate(data.from)} to ${formatDate(data.to)}${running ? ' (so far)' : ''}, with the working behind each flag. A flag is a reason to look, not proof.`}
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
        {data.sections.length > 1 ? (
          <Segmented
            aria-label="Kind of check"
            style={{ maxWidth: '100%', overflowX: 'auto' }}
            value={section}
            onChange={(v) => setSection(v as LeakageSection | 'ALL')}
            options={[{ value: 'ALL', label: `All (${scoped.length})` }, ...data.sections.map((s) => ({ value: s, label: `${LEAKAGE_SECTION_LABELS[s]} (${scoped.filter((f) => f.section === s).length})` }))]}
          />
        ) : null}
      </Flex>

      <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
        <Card size="small" style={{ flex: '1 1 150px' }}>
          <Statistic
            title="At risk this month"
            value={0}
            formatter={() => <span translate="no">{totalInr !== null ? formatINRCompact(totalInr) : `${scoped.length} flags`}</span>}
            styles={{ content: { fontSize: token.fontSizeHeading4 } }}
          />
          <Typography.Text type="secondary">
            {scoped.length === 1 ? '1 flag' : `${scoped.length} flags`} over {data.projects === 1 ? '1 project' : `${data.projects} projects`}
          </Typography.Text>
        </Card>
        {data.sections.map((s) => {
          const t = total(s);
          const count = scoped.filter((f) => f.section === s).length;
          return (
            <Card key={s} size="small" style={{ flex: '1 1 150px' }}>
              <Statistic
                title={LEAKAGE_SECTION_LABELS[s]}
                value={0}
                formatter={() => <span translate="no">{t !== null ? formatINRCompact(t) : count === 1 ? '1 flag' : `${count} flags`}</span>}
                styles={{ content: { fontSize: token.fontSizeHeading4 } }}
              />
              <Typography.Text type="secondary">{SECTION_HELP[s]}</Typography.Text>
            </Card>
          );
        })}
      </Flex>

      {shown.length ? (
        <Flex vertical gap={token.marginSM}>
          {shown.map(card)}
        </Flex>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={scoped.length ? 'Nothing of this kind this month.' : 'Nothing found this month: no rule points to a leak.'} />
      )}
    </div>
  );
}
