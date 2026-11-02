'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Typography } from 'antd';
import { tk } from '@/ds';
import { CheckSquareOutlined } from '@/components/common/icons';
import type { NavNode, SubmissionType } from '@erp/shared';
import { SUBMISSION_TYPE_PLURAL_LABELS, mayApprove, navDestination, navNodeForPath, projectTabHref, submissionListHref } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLauncherBadges, usePendingApprovals } from '@/lib/queries';
import { requestNew } from '@/lib/new-intent';
import { formatINRCompact } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton } from '@/components/common/QueryState';
import { newEntriesFor } from '@/components/shell/NewMenu';
import { useNavMenu } from '@/components/shell/menu';
import { ProjectPick, nodeBadge, type TileBadge } from '@/components/launcher/TileGrid';
import { useProjectScope } from '@/lib/project-scope';
import { TreeIcon } from '@/components/shell/nav-icons';
import { ProjectFiguresPanel, ProjectProgressPanel } from './ProjectProgress';
import { DepartmentFigures, DepartmentPipelines } from './DepartmentPanel';
import { NotInYourMenu } from './ModuleHome';
import s from './DepartmentHome.module.css';

/** The department that holds the projects shows their figures and progress above its pages. */
const PROJECTS_DEPARTMENT = 'project-management';

/** One page of a sub-module: its icon in ink, its name, what waits there (with its word, in full), and the line on what it is for.
 *  A project tab with no project chosen in the header asks for the project. */
function PageRow({ node, badge, projectId, onPick }: { node: NavNode; badge?: TileBadge; projectId: string | undefined; onPick: (n: NavNode) => void }) {
  const to = navDestination(node);
  const href = !to ? null : to.kind === 'page' ? to.href : projectId ? projectTabHref(projectId, to.tab, to.query) : null;
  const descId = useId();
  // The name says what waits there; the line under it describes it, as a Home tile does.
  const waiting = badge ? `${badge.count.toLocaleString('en-IN')} ${badge.word}` : null;
  const a11y = { 'aria-label': waiting ? `${node.label}, ${waiting}` : undefined, 'aria-describedby': waiting && node.description ? descId : undefined };
  const body = (
    <>
      <span className={s.chip} aria-hidden>
        <TreeIcon name={node.icon} />
      </span>
      <span className={s.text}>
        <span className={s.label}>{node.label}</span>
        {node.description && (
          <span id={descId} className={s.desc}>
            {node.description}
          </span>
        )}
      </span>
      {waiting && (
        <span className={badge?.info ? s.count : s.badge} translate="no" aria-hidden>
          {waiting}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={s.page} {...a11y}>
      {body}
    </Link>
  ) : (
    <button type="button" className={s.page} onClick={() => onPick(node)} aria-haspopup="dialog" {...a11y}>
      {body}
    </button>
  );
}

/**
 * A department module's screen (Menu and names), answer first: the module the company named, its figures, what waits for
 * the user in it, progress and its pipelines, what they can start there, and last its pages under each sub-module. The
 * sub-modules are also the bar under the top bar.
 */
export function DepartmentHome({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { menu } = useNavMenu(user);
  const mod = menu.find((m) => m.key === moduleKey);
  const { data: badges } = useLauncherBadges(!!mod);
  const approver = !!user && mayApprove(user);
  const { data: pending } = usePendingApprovals(approver && !!mod);
  const [projectId] = useProjectScope();
  const [picking, setPicking] = useState<NavNode | null>(null);

  const ids = useMemo(() => new Set(mod?.subs.flatMap((s) => s.nodes.map((n) => n.shortcutOf ?? n.id)) ?? []), [mod]);
  const waiting = useMemo(() => {
    const byType = new Map<SubmissionType, { count: number; amount: number }>();
    for (const p of approver ? (pending ?? []) : []) {
      const [path, query = ''] = submissionListHref(p.type).split('?');
      const node = navNodeForPath(path, query);
      if (!node || !ids.has(node.id)) continue;
      const at = byType.get(p.type) ?? { count: 0, amount: 0 };
      at.count++;
      at.amount += Number(p.amount ?? 0);
      byType.set(p.type, at);
    }
    return [...byType.entries()];
  }, [pending, ids, approver]);

  if (!user) return <PageSkeleton shape="home" />;
  if (!mod)
    return <NotInYourMenu />;

  const paths = new Set(mod.subs.flatMap((sub) => sub.nodes.map(navDestination).flatMap((d) => (d?.kind === 'page' ? [d.href.split('?')[0]] : []))));
  const starts = newEntriesFor(user)
    .flat()
    .filter((e) => paths.has('/' + e.href.split(/[/?]/)[1]));
  const actions = starts.length ? (
    <>
      {starts.slice(0, 4).map((e) => (
        <Button key={e.kind} icon={e.icon} onClick={() => requestNew(e.kind, () => router.push(e.href))}>
          {e.action}
        </Button>
      ))}
    </>
  ) : undefined;

  return (
    <div className="page-container">
      <PageHeader title={`${mod.label} overview`} subtitle={mod.description} extra={actions} />
      <Flex vertical gap={24}>
        {moduleKey === PROJECTS_DEPARTMENT && <ProjectFiguresPanel />}
        <DepartmentFigures department={moduleKey} />
        {waiting.length > 0 && (
          <Card size="small" title="Waiting for you">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {waiting.map(([type, w], i) => (
                <li key={type}>
                  <Link href={`/approvals?type=${type}`} className="text-link">
                    <Flex align="center" justify="space-between" gap={tk.space[3]} style={{ minHeight: 44, borderTop: i ? tk.line('hairline') : undefined }}>
                      <span>
                        <CheckSquareOutlined aria-hidden /> {SUBMISSION_TYPE_PLURAL_LABELS[type]}: {w.count} to approve
                      </span>
                      {w.amount > 0 && (
                        <Typography.Text type="secondary" translate="no">
                          {formatINRCompact(w.amount)}
                        </Typography.Text>
                      )}
                    </Flex>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {moduleKey === PROJECTS_DEPARTMENT && <ProjectProgressPanel />}
        <DepartmentPipelines department={moduleKey} />
        {/* The pages last: the sidebar and the bar under the top bar list them too, so the screen leads with the answer. */}
        <div className={s.subs}>
          {mod.subs.map((sub) => (
            <section key={sub.key} aria-labelledby={`sub-${sub.key}`} className={s.sub}>
              <h2 id={`sub-${sub.key}`} className={s.subTitle}>
                {sub.label}
              </h2>
              <ul className={s.pages}>
                {sub.nodes.map((n) => (
                  <li key={n.id}>
                    <PageRow node={n} badge={nodeBadge(badges, n.id)} projectId={projectId} onPick={setPicking} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <ProjectPick node={picking} onClose={() => setPicking(null)} />
      </Flex>
    </div>
  );
}
