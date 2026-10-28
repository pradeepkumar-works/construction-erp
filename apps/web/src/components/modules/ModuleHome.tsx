'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Col, Flex, Grid, Result, Row, Typography, theme } from 'antd';
import { CheckSquareOutlined, HourglassOutlined, RollbackOutlined } from '@/components/common/icons';
import type { ModuleHomeDto, ModuleKey } from '@erp/shared';
import { MODULE_INTROS, MODULE_LABELS, MODULE_SUBMISSION_TYPES, SUBMISSION_TYPE_LABELS, canManageStaff, canSeeNav, canViewEmployeePrivate, isModuleKey, navDestination, navNode, navTilesFor, projectTabHref, submissionListHref } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useModuleHome } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { requestNew } from '@/lib/new-intent';
import { formatINRCompact } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { kpiColumns } from '@/components/home/KpiTile';
import { newEntriesFor } from '@/components/shell/NewMenu';
import { HrDashboard } from '@/components/staff/HrDashboard';
import { ProjectProgress } from './ProjectProgress';
import { ModuleFigure as Figure } from './ModuleFigure';
import { TileGrid, tileEntries } from '@/components/launcher/TileGrid';
import { usePins } from '@/components/launcher/pins';
import { useNavMenu } from '@/components/shell/menu';
import { ResultMark } from '@/components/common/ResultMark';

const days = (n: number) => (n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`);

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

/**
 * A module's screen (v6 item 98, launcher phase 1): a tile for each of the module's pages this person may open, then its
 * figures for the header's project (or every project they see), what waits for them in it, and what they can start there.
 * A module where they see one page only opens that page.
 */
export function ModuleHome({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [projectId] = useProjectScope();
  const node = navNode(moduleKey);
  const visible = !!user && !!node && isModuleKey(moduleKey) && canSeeNav(user, node);
  const tiles = visible ? navTilesFor(user, moduleKey) : [];
  const { data, isLoading, error, refetch } = useModuleHome(moduleKey, projectId, visible && tiles.length > 1);
  const screens = Grid.useBreakpoint();
  const { tileMenu } = usePins(visible ? user : null);
  const { settings } = useNavMenu(user);

  // One page only: no screen of one tile, that page opens instead.
  const only = tiles.length === 1 ? navDestination(tiles[0]) : null;
  const onlyHref = only?.kind === 'page' ? only.href : only?.kind === 'project' && projectId ? projectTabHref(projectId, only.tab, only.query) : null;
  useEffect(() => {
    if (onlyHref) router.replace(onlyHref);
  }, [onlyHref, router]);

  if (!user || onlyHref) return <PageSkeleton shape="home" />;
  if (!visible || !isModuleKey(moduleKey))
    return (
      <div className="page-container">
        <PageHeader title="Module" docTitle="Module not found" />
        <Result icon={<ResultMark kind="not-found" />} title="This module is not in your menu" subTitle="Your role does not use it. Choose a module from Home." />
      </div>
    );
  const key: ModuleKey = moduleKey;
  // The company's name for the module (Menu and names), else its own
  const label = settings.names[key]?.trim() || MODULE_LABELS[key];
  const paths = new Set(tiles.map(navDestination).flatMap((d) => (d?.kind === 'page' ? [d.href.split('?')[0]] : [])));
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
  const waits = MODULE_SUBMISSION_TYPES[key].length > 0;

  return (
    <div className="page-container">
      <PageHeader title={`${label} overview`} subtitle={MODULE_INTROS[key]} extra={actions} />
      <Flex vertical gap={24}>
        <TileGrid entries={tileEntries(tiles)} label={`Pages in ${label.toLowerCase()}`} menu={tileMenu} />
        {isLoading && <PageSkeleton shape="home" header={false} />}
        {error && <QueryError error={error} onRetry={() => refetch()} />}
        {data && (data.figures.length > 0 || waits) && (
          <Row gutter={[16, 16]}>
            {data.figures.length > 0 && (
              <Col xs={24} xl={waits ? 15 : 24}>
                <section aria-label={`${label} figures`}>
                  <Row gutter={[16, 16]}>
                    {data.figures.map((f) => (
                      <Col key={f.key} flex={`0 0 ${100 / (waits && screens.xl ? Math.min(perRow, 3) : perRow)}%`}>
                        <Figure f={f} />
                      </Col>
                    ))}
                  </Row>
                </section>
              </Col>
            )}
            {waits && (
              <Col xs={24} xl={data.figures.length > 0 ? 9 : 12}>
                <Waiting data={data} label={label} />
              </Col>
            )}
          </Row>
        )}
        {data?.progress && <ProjectProgress data={data.progress} />}
        {key === 'people' && (canManageStaff(user.roleKey) || canViewEmployeePrivate(user.roleKey)) && <HrDashboard />}
      </Flex>
    </div>
  );
}
