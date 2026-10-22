'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Empty, Flex, Grid, Result, Row, Statistic, Typography, theme } from 'antd';
import { CheckSquareOutlined, HourglassOutlined, RightOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ModuleFigureDto, ModuleHomeDto, ModuleKey } from '@erp/shared';
import { MODULE_INTROS, MODULE_LABELS, SUBMISSION_TYPE_LABELS, submissionListHref } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useModuleHome } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { requestNew } from '@/lib/new-intent';
import { formatINR, formatINRCompact } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { KpiTile, kpiColumns } from '@/components/home/KpiTile';
import { newEntriesFor } from '@/components/shell/NewMenu';
import { NAV_DESCRIPTIONS, moduleSection, type NavItem } from '@/components/shell/nav';

const days = (n: number) => (n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`);

/** One figure: a count, rupees or "4 of 6", with the line that says what it stands against. */
function Figure({ f }: { f: ModuleFigureDto }) {
  const { token } = theme.useToken();
  const value = f.format === 'money' ? formatINRCompact(f.value) : f.format === 'ratio' ? `${f.value} of ${f.of ?? 0}` : f.value;
  const note = f.note ? (f.noteMoney != null ? f.note.replace('{money}', formatINR(f.noteMoney)) : f.note) : null;
  return (
    <KpiTile href={f.href}>
      <Statistic title={f.label} value={value} valueRender={() => <span translate="no">{value}</span>} />
      {note && (
        <Typography.Text type={f.tone === 'danger' ? 'danger' : f.tone === 'warning' ? 'warning' : 'secondary'} style={{ display: 'block', fontSize: token.fontSizeSM, marginTop: token.marginXXS }}>
          {note}
        </Typography.Text>
      )}
    </KpiTile>
  );
}

/** What waits for the caller in this module: approvals by type, their entries sent back, and theirs waiting with others. */
function Waiting({ data, label }: { data: ModuleHomeDto; label: string }) {
  const { token } = theme.useToken();
  const total = data.waiting.reduce((s, w) => s + w.count, 0);
  const back = data.sentBack.reduce((s, w) => s + w.count, 0);
  const row: React.CSSProperties = { minHeight: 44, padding: `${token.paddingXS}px 0`, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` };
  return (
    <Card size="small" title="Waiting for you" style={{ height: '100%' }}>
      {total === 0 && back === 0 && data.waitingWithOthers === 0 ? (
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Nothing waits for you in {label.toLowerCase()}.
        </Typography.Paragraph>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.waiting.map((w) => (
            <li key={w.type}>
              <Link href={`/approvals?type=${w.type}`} className="text-link">
                <Flex align="center" justify="space-between" gap={token.marginSM} style={row}>
                  <span>
                    <CheckSquareOutlined aria-hidden /> {w.count} {SUBMISSION_TYPE_LABELS[w.type].toLowerCase()} to approve
                  </span>
                  <Typography.Text type={w.oldestDays > 2 ? 'warning' : 'secondary'} style={{ fontSize: token.fontSizeSM, whiteSpace: 'nowrap' }}>
                    {w.amount !== null ? <span translate="no">{formatINRCompact(w.amount)} · </span> : null}
                    oldest {days(w.oldestDays)}
                  </Typography.Text>
                </Flex>
              </Link>
            </li>
          ))}
          {data.sentBack.map((s) => (
            <li key={`back-${s.type}`}>
              <Link href={submissionListHref(s.type)} className="text-link">
                <Flex align="center" gap={token.marginXS} style={row}>
                  <RollbackOutlined aria-hidden /> {s.count} of your {SUBMISSION_TYPE_LABELS[s.type].toLowerCase()} entries sent back or turned down
                </Flex>
              </Link>
            </li>
          ))}
          {data.waitingWithOthers > 0 && (
            <li>
              <Flex align="center" gap={token.marginXS} style={row}>
                <HourglassOutlined aria-hidden /> {data.waitingWithOthers} of your entries waiting with others
              </Flex>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

/** A page of the module: its icon, name and what it is for, the whole card a link. */
function PageCard({ item }: { item: NavItem }) {
  const { token } = theme.useToken();
  const Icon = item.icon;
  return (
    <Link href={item.href} style={{ display: 'block', height: '100%' }}>
      <Card size="small" hoverable style={{ height: '100%' }}>
        <Flex gap={token.marginSM} align="flex-start">
          <span
            aria-hidden
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: token.controlHeight, height: token.controlHeight, borderRadius: token.borderRadiusLG, background: token.colorPrimaryBg, color: token.colorPrimary, fontSize: token.fontSizeLG }}
          >
            <Icon />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Text strong style={{ display: 'block' }}>
              {item.label}
            </Typography.Text>
            {NAV_DESCRIPTIONS[item.href] && (
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                {NAV_DESCRIPTIONS[item.href]}
              </Typography.Text>
            )}
          </div>
          <RightOutlined aria-hidden style={{ color: token.colorTextTertiary, marginTop: token.marginXXS }} />
        </Flex>
      </Card>
    </Link>
  );
}

/**
 * A module's home page (v6 item 98): its figures for the header's project (or every project the person sees), what
 * waits for them in the module, the module's pages with a line on each, and what they can start in it.
 */
export function ModuleHome({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [projectId] = useProjectScope();
  const section = user ? moduleSection(user, moduleKey) : null;
  const { data, isLoading, error, refetch } = useModuleHome(moduleKey, projectId, !!section);
  const screens = Grid.useBreakpoint();

  if (!user) return <PageSkeleton shape="home" />;
  if (!section || !section.module)
    return (
      <div className="page-container">
        <PageHeader title="Module" docTitle="Module not found" />
        <Result status="404" title="This module is not in your menu" subTitle="Your role does not use it. Choose a page from the menu on the left." />
      </div>
    );
  const key: ModuleKey = section.module;
  const label = MODULE_LABELS[key];
  const pages = section.items.filter((i) => !i.overview);
  const paths = new Set(pages.map((p) => p.href));
  const starts = newEntriesFor(user)
    .flat()
    .filter((e) => paths.has('/' + e.href.split(/[/?]/)[1]));
  const actions = starts.length ? (
    <>
      {starts.map((e) => (
        <Button key={e.kind} icon={e.icon} onClick={() => requestNew(e.kind, () => router.push(e.href))}>
          {e.label}
        </Button>
      ))}
    </>
  ) : undefined;
  const perRow = kpiColumns(data?.figures.length ?? 4, screens);

  return (
    <div className="page-container">
      <PageHeader title={label} docTitle={`${label} overview`} subtitle={MODULE_INTROS[key]} extra={actions} />
      {isLoading && <PageSkeleton shape="home" header={false} />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <Flex vertical gap={16}>
          {data.figures.length > 0 && (
            <section aria-label={`${label} figures`}>
              <Row gutter={[16, 16]}>
                {data.figures.map((f) => (
                  <Col key={f.key} flex={`0 0 ${100 / perRow}%`}>
                    <Figure f={f} />
                  </Col>
                ))}
              </Row>
            </section>
          )}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={9}>
              <Waiting data={data} label={label} />
            </Col>
            <Col xs={24} lg={15}>
              <Card size="small" title={`Pages in ${label.toLowerCase()}`}>
                {pages.length ? (
                  <Row gutter={[12, 12]}>
                    {pages.map((p) => (
                      <Col key={p.href} xs={24} md={12}>
                        <PageCard item={p} />
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <Empty description="No pages" />
                )}
              </Card>
            </Col>
          </Row>
        </Flex>
      )}
    </div>
  );
}
