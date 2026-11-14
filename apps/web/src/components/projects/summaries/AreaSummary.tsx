'use client';

import React from 'react';
import Link from 'next/link';
import { Flex, Skeleton, Typography } from 'antd';
import {
  SUBMISSION_TYPE_PLURAL_LABELS,
  projectTabHref,
  submissionListHref,
  type AreaWaitingDto,
  type ProjectArea,
  type ProjectAreaDto,
  type ProjectDetail,
  type WarningDto,
} from '@erp/shared';
import { useProjectArea } from '@/lib/queries';
import { formatDate, formatINRCompact, inSentence, plural } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { Figures } from '@/components/figures';
import { CheckSquareOutlined, HourglassOutlined, WarningOutlined } from '@/components/common/icons';
import { WORKSPACE_GROUPS, useGroupTabs } from '@/components/projects/ProjectWorkspace';
import { tk } from '@/ds';

const AREA_LABELS = Object.fromEntries(WORKSPACE_GROUPS.map((g) => [g.key, g.label])) as Record<ProjectArea, string>;

const row: React.CSSProperties = { minHeight: 44, paddingBlock: tk.space[2], borderTop: tk.line('hairline') };
const list: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0 };
const quiet: React.CSSProperties = { ...tk.type.caption, color: tk.color.text.muted };
/** A row that opens something: the whole row is the target, only its name is underlined. */
const rowLink: React.CSSProperties = { display: 'block', textDecoration: 'none' };
const name: React.CSSProperties = { textDecoration: 'underline' };

const oldest = (days: number) => (days === 0 ? 'from today' : `oldest ${plural(days, 'day')}`);

/** Where a row of what waits opens: the inbox for the caller's own, else the project tab (or the company list) that has them. */
function waitingHref(w: AreaWaitingDto, projectId: string) {
  if (w.yours) return `/approvals?type=${w.type}`;
  if (w.tab) return projectTabHref(projectId, w.tab);
  const list = submissionListHref(w.type);
  return `${list}${list.includes('?') ? '&' : '?'}projectId=${projectId}`;
}

/** What waits for approval in the area, on whom, the money and the oldest first (`rankWaiting`, done by the API). */
function Waiting({ data, projectId, area }: { data: ProjectAreaDto | undefined; projectId: string; area: ProjectArea }) {
  if (data && data.waiting === null) return null;
  return (
    <Section title="What waits">
      {!data ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : !data.waiting?.length ? (
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Nothing in {inSentence(AREA_LABELS[area])} waits for approval on this project.
        </Typography.Paragraph>
      ) : (
        <ul style={list} aria-label="What waits">
          {data.waiting.map((w) => (
            <li key={`${w.type}-${w.yours ? 'you' : w.waitingWith.join()}`}>
              <Link href={waitingHref(w, projectId)} className="text-link" style={rowLink}>
                <Flex align="center" justify="space-between" gap={tk.space[3]} wrap style={row}>
                  <span style={name}>
                    {w.yours ? <CheckSquareOutlined aria-hidden /> : <HourglassOutlined aria-hidden />} {SUBMISSION_TYPE_PLURAL_LABELS[w.type]}: {w.count}{' '}
                    {w.yours ? 'for you to approve' : w.waitingWith.length ? `with ${w.waitingWith.join(' or ')}` : 'waiting'}
                  </span>
                  <span style={{ ...quiet, color: w.oldestDays > 2 ? tk.color.tone.pending.fg : tk.color.text.muted, whiteSpace: 'nowrap' }}>
                    {w.amount !== null ? <span translate="no">{formatINRCompact(w.amount)} · </span> : null}
                    {oldest(w.oldestDays)}
                  </span>
                </Flex>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** The project's open watch-list warnings in the area, the most at stake first, as the watch list orders them. */
function Exceptions({ data, projectId, area }: { data: ProjectAreaDto | undefined; projectId: string; area: ProjectArea }) {
  if (data && data.exceptions === null) return null;
  const watchList = `/watch-list?projectId=${projectId}`;
  return (
    <Section title="On the watch list">
      {!data ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : !data.exceptions?.length ? (
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          No warning on this project in {inSentence(AREA_LABELS[area])}.
        </Typography.Paragraph>
      ) : (
        <>
          <ul style={list} aria-label="Warnings">
            {data.exceptions.map((w) => (
              <Warning key={w.key} w={w} fallback={watchList} />
            ))}
          </ul>
          {data.moreExceptions > 0 && (
            <p style={{ margin: 0, paddingTop: tk.space[2], borderTop: tk.line('hairline') }}>
              <Link href={watchList} className="text-link">
                {plural(data.moreExceptions, 'more warning')} on the watch list
              </Link>
            </p>
          )}
        </>
      )}
    </Section>
  );
}

function Warning({ w, fallback }: { w: WarningDto; fallback: string }) {
  return (
    <li>
      <Link href={w.links[0]?.href ?? fallback} className="text-link" style={rowLink}>
        <Flex gap={tk.space[2]} style={row}>
          <WarningOutlined aria-hidden style={{ color: tk.color.tone.pending.fg, marginTop: tk.space[1] }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ ...name, display: 'block' }}>{w.title}</span>
            <span style={{ ...quiet, display: 'block' }}>
              {w.action}
              {w.impact ? ` · ${w.impact.text}` : ''}
            </span>
          </span>
        </Flex>
      </Link>
    </li>
  );
}

/** The plan's finish beside the date it stands against. */
function Finish({ finish }: { finish: NonNullable<ProjectAreaDto['finish']> }) {
  const planned = finish.planned ? `The plan finishes on ${formatDate(finish.planned)}` : 'The plan has no finish date yet';
  const against = finish.completion ? `; the completion date, after the extensions of time granted, is ${formatDate(finish.completion)}.` : '; the contract has no completion date yet.';
  return (
    <p style={{ ...quiet, margin: 0 }}>
      {planned}
      {against}
    </p>
  );
}

/** The group's other tabs, by name. */
function Pages({ projectId, area }: { projectId: string; area: ProjectArea }) {
  const tabs = useGroupTabs();
  if (!tabs.length) return null;
  return (
    <Section title={`${AREA_LABELS[area]} pages`}>
      <nav aria-label={`${AREA_LABELS[area]} pages`}>
        <ul style={{ ...list, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 16rem), 1fr))', columnGap: tk.space[6] }}>
          {tabs.map((t) => (
            <li key={t.key}>
              <Link href={projectTabHref(projectId, t.key)} className="text-link" style={{ ...row, ...rowLink }}>
                <span style={name}>{t.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Section>
  );
}

/**
 * The first tab of a project group (ARCHITECTURE "Overviews answer first"): the area's figures, what waits on whom, the
 * project's warnings in it, then the group's other tabs. The API leaves out what the role may not see.
 */
export function AreaSummary({ project, area }: { project: ProjectDetail; area: ProjectArea }) {
  const { data, error, refetch } = useProjectArea(project.id, area);
  const label = AREA_LABELS[area];
  return (
    <div style={{ display: 'grid', gap: tk.space[4], padding: `0 ${tk.space[3]} ${tk.space[3]}` }}>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <Figures bare label={`${label} figures`} figures={data?.figures} scope={{ projectId: project.id }} />
          {data?.finish ? <Finish finish={data.finish} /> : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))', gap: tk.space[4], alignItems: 'start' }}>
            <Waiting data={data} projectId={project.id} area={area} />
            <Exceptions data={data} projectId={project.id} area={area} />
          </div>
        </>
      )}
      <Pages projectId={project.id} area={area} />
    </div>
  );
}
