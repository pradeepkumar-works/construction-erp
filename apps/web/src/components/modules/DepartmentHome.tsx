'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Flex, Result, Typography, theme } from 'antd';
import { CheckSquareOutlined } from '@/components/common/icons';
import type { NavNode, SubmissionType } from '@erp/shared';
import { SUBMISSION_TYPE_LABELS, mayApprove, navDestination, navNodeForPath, projectTabHref, submissionListHref } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useLauncherBadges, usePendingApprovals } from '@/lib/queries';
import { requestNew } from '@/lib/new-intent';
import { formatINRCompact } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { newEntriesFor } from '@/components/shell/NewMenu';
import { useNavMenu } from '@/components/shell/menu';
import { ProjectPick, familyOf } from '@/components/launcher/TileGrid';
import { familyColors } from '@/lib/brand';
import { useAppearance } from '@/lib/appearance';
import { useProjectScope } from '@/lib/project-scope';
import { TreeIcon } from '@/components/shell/nav-icons';
import { ProjectProgressPanel } from './ProjectProgress';
import { DepartmentPanel } from './DepartmentPanel';
import s from './DepartmentHome.module.css';

/** The department that holds the projects shows their progress above its pages. */
const PROJECTS_DEPARTMENT = 'project-management';

// "Vendor Bill" reads "Vendor bill"; a short form (RA, MB) keeps its capitals.
const sentence = (label: string) =>
  label
    .split(' ')
    .map((w, i) => (i === 0 || /^\(?[A-Z]{2,}/.test(w) ? w : w.toLowerCase()))
    .join(' ');

/** One page of a sub-module: its icon in its module's colours, its name, what waits there, and the line on what it is for.
 *  A project tab with no project chosen in the header asks for the project. */
function PageRow({ node, badge, projectId, onPick }: { node: NavNode; badge?: number; projectId: string | undefined; onPick: (n: NavNode) => void }) {
  const { dark } = useAppearance();
  const { fg, bg } = familyColors(familyOf(node), dark);
  const to = navDestination(node);
  const href = !to ? null : to.kind === 'page' ? to.href : projectId ? projectTabHref(projectId, to.tab, to.query) : null;
  const descId = useId();
  // The name says what waits there; the line under it describes it, as a Home tile does.
  const a11y = { 'aria-label': badge ? `${node.label}, ${badge} waiting` : undefined, 'aria-describedby': badge && node.description ? descId : undefined };
  const body = (
    <>
      <span className={s.chip} style={{ color: fg, background: bg }} aria-hidden>
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
      {!!badge && (
        <span className={s.badge} translate="no" aria-hidden>
          {badge > 99 ? '99+' : badge}
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
 * A department module's screen (Menu and names): the module the company named, what waits for the user in it, what
 * they can start there, and its pages under each sub-module. The sub-modules are also the bar under the top bar.
 */
export function DepartmentHome({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const { token } = theme.useToken();
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
    return (
      <div className="page-container">
        <PageHeader title="Module" docTitle="Module not found" />
        <Result icon={<ResultMark kind="not-found" />} title="This module is not in your menu" subTitle="Your role does not use it. Choose a module from Home." />
      </div>
    );

  const paths = new Set(mod.subs.flatMap((sub) => sub.nodes.map(navDestination).flatMap((d) => (d?.kind === 'page' ? [d.href.split('?')[0]] : []))));
  const starts = newEntriesFor(user)
    .flat()
    .filter((e) => paths.has('/' + e.href.split(/[/?]/)[1]));
  const actions = starts.length ? (
    <>
      {starts.slice(0, 4).map((e) => (
        <Button key={e.kind} icon={e.icon} onClick={() => requestNew(e.kind, () => router.push(e.href))}>
          {e.label}
        </Button>
      ))}
    </>
  ) : undefined;

  return (
    <div className="page-container">
      <PageHeader title={mod.label} subtitle={mod.description} extra={actions} />
      <Flex vertical gap={24}>
        {waiting.length > 0 && (
          <Card size="small" title="Waiting for you">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {waiting.map(([type, w], i) => (
                <li key={type}>
                  <Link href={`/approvals?type=${type}`} className="text-link">
                    <Flex align="center" justify="space-between" gap={token.marginSM} style={{ minHeight: 44, borderTop: i ? `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` : undefined }}>
                      <span>
                        <CheckSquareOutlined aria-hidden /> {sentence(SUBMISSION_TYPE_LABELS[type])}: {w.count} to approve
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
        <DepartmentPanel department={moduleKey} />
        <div className={s.subs}>
          {mod.subs.map((sub) => (
            <section key={sub.key} aria-labelledby={`sub-${sub.key}`} className={s.sub}>
              <h2 id={`sub-${sub.key}`} className={s.subTitle}>
                {sub.label}
              </h2>
              <ul className={s.pages}>
                {sub.nodes.map((n) => (
                  <li key={n.id}>
                    <PageRow node={n} badge={badges?.nodes?.[n.id]} projectId={projectId} onPick={setPicking} />
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
