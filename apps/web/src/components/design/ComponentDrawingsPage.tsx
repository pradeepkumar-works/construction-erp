'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, Flex, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { tk } from '@/ds';
import {
  COMPONENT_STATE_LABELS,
  COMPONENT_STATES,
  DOCUMENT_DISCIPLINE_LABELS,
  REVISION_STATUS_LABELS,
  figure,
  isBuildable,
  type ComponentRowDto,
  type ComponentState,
  type DocumentDiscipline,
} from '@erp/shared';
import { useComponentDrawings } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { NO_VALUE, formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { EmptyArt } from '@/components/common/EmptyArt';
import { AppTag } from '@/components/common/AppTag';
import { Figures } from '@/components/figures';

const caption: React.CSSProperties = { display: 'block', fontSize: tk.type.caption.fontSize };

/** A component's drawings in one discipline: each number with its current revision, AFC or what it waits for. */
function DrawingCell({ row, discipline }: { row: ComponentRowDto; discipline: DocumentDiscipline }) {
  const drawings = row.drawings.filter((d) => d.discipline === discipline);
  if (!drawings.length) return <Typography.Text type="secondary">{NO_VALUE}</Typography.Text>;
  return (
    <Flex vertical gap={tk.space[2]}>
      {drawings.map((d) => (
        <div key={d.documentId}>
          <Link href={`/documents?id=${d.documentId}`} translate="no">
            {d.docNo}
          </Link>
          <Typography.Text type={isBuildable(d.revisionStatus) ? undefined : 'secondary'} style={caption} translate="no">
            {d.revision ? `${d.revision}, ${isBuildable(d.revisionStatus) ? 'AFC' : REVISION_STATUS_LABELS[d.revisionStatus!].toLowerCase()}` : 'No revision yet'}
          </Typography.Text>
        </div>
      ))}
    </Flex>
  );
}

/** A review stage's day for the component's latest submittal: when it cleared, sent back, waiting, or to come. */
function StageCell({ row, stage }: { row: ComponentRowDto; stage: string }) {
  const s = row.review?.stages.find((x) => x.name === stage);
  if (!row.review || !s) return <Typography.Text type="secondary">{NO_VALUE}</Typography.Text>;
  if (s.clearedOn && s.code && s.code !== 'A' && s.code !== 'B')
    return (
      <div>
        <span translate="no">{formatDate(s.clearedOn)}</span>
        <Typography.Text style={{ ...caption, color: tk.color.tone.danger.fg }}>{`Code ${s.code}, sent back`}</Typography.Text>
      </div>
    );
  if (s.clearedOn) return <span translate="no">{formatDate(s.clearedOn)}</span>;
  if (row.review.waitingAt === stage)
    return <Typography.Text style={{ color: tk.color.tone.pending.fg }}>{row.review.daysLate ? `Waiting, ${row.review.daysLate} day${row.review.daysLate === 1 ? '' : 's'} late` : 'Waiting'}</Typography.Text>;
  return <Typography.Text type="secondary">To come</Typography.Text>;
}

/**
 * Drawings by component: the construction programme's drawing matrix. Each component of the project with its drawings by
 * discipline at their current revisions, the day its latest submittal went and the day each review stage cleared it, and
 * whether the component is approved for construction.
 */
export function ComponentDrawingsPage() {
  const [projectId, setProjectId] = useProjectScope(useSearchParams().get('projectId') ?? undefined);
  const [discipline, setDiscipline] = useState<DocumentDiscipline | undefined>();
  const [state, setState] = useState<ComponentState | undefined>();
  const { data, isLoading, error, refetch } = useComponentDrawings(projectId);
  const disciplines = (data?.disciplines ?? []).filter((d) => !discipline || d === discipline);
  const rows = (data?.rows ?? []).filter((r) => (!state || r.state === state) && (!discipline || r.drawings.some((d) => d.discipline === discipline) || !r.drawings.length));
  const t = data?.totals;

  const columns: ColumnsType<ComponentRowDto> = [
    {
      title: 'Component',
      key: 'component',
      fixed: 'left',
      width: 230,
      render: (_, r) => (
        <div>
          <Typography.Text strong translate="no">
            {r.code ? `${r.code}. ${r.name}` : r.name}
          </Typography.Text>
          <Typography.Text type="secondary" style={caption}>
            {r.drawings.length ? `${r.drawings.length} drawing${r.drawings.length === 1 ? '' : 's'}` : 'No drawing linked yet'}
          </Typography.Text>
        </div>
      ),
    },
    ...disciplines.map((d) => ({ title: DOCUMENT_DISCIPLINE_LABELS[d], key: `d-${d}`, width: 170, render: (_: unknown, r: ComponentRowDto) => <DrawingCell row={r} discipline={d} /> })),
    {
      title: 'Submitted',
      key: 'submitted',
      width: 130,
      render: (_, r) =>
        r.review?.submittedOn ? (
          <div>
            <span translate="no">{formatDate(r.review.submittedOn)}</span>
            <Link href={`/design-submissions/${r.review.submissionId}`} style={caption} translate="no">
              {r.review.submissionNo}
            </Link>
          </div>
        ) : (
          <Typography.Text type="secondary">{r.drawings.length ? 'Not yet' : NO_VALUE}</Typography.Text>
        ),
    },
    ...(data?.stages ?? []).map((s) => ({ title: s, key: `s-${s}`, width: 130, render: (_: unknown, r: ComponentRowDto) => <StageCell row={r} stage={s} /> })),
    ...(data?.stages.length
      ? []
      : [
          {
            title: 'Coded',
            key: 'coded',
            width: 130,
            render: (_: unknown, r: ComponentRowDto) => (r.review?.reviewedOn ? <span translate="no">{`${formatDate(r.review.reviewedOn)}, code ${r.review.code}`}</span> : <Typography.Text type="secondary">{NO_VALUE}</Typography.Text>),
          },
        ]),
    {
      title: 'Status',
      key: 'state',
      width: 170,
      render: (_, r) => (
        <div>
          <AppTag kind="componentDrawings" status={r.state}>
            {COMPONENT_STATE_LABELS[r.state]}
          </AppTag>
          {r.state === 'UNDER_REVIEW' && r.review?.waitingAt ? (
            <Typography.Text type="secondary" style={caption} translate="no">{`Waiting at ${r.review.waitingAt}`}</Typography.Text>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="page-container">
      <PageHeader title="Drawings by component" subtitle="Each component with its drawings by discipline, and how far their approval has gone." />
      <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" placeholder="Choose a project" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      {!projectId ? (
        <Card size="small">
          <EmptyArt art="entries" title="Choose a project to see its components and their drawings" />
        </Card>
      ) : isLoading ? (
        <PageSkeleton shape="list" header={false} />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <Flex vertical gap={tk.space[4]}>
          {t ? (
            <Figures
              label="Component figures"
              figures={[
                figure('componentsAfc', t.afc, { versus: { of: t.components } }),
                figure('drawingsAfc', t.drawingsAfc, { versus: { of: t.drawings } }),
                figure('componentsInReview', t.underReview),
                figure('componentsBack', t.backWithUs),
              ]}
              scope={{ projectId }}
            />
          ) : null}
          <Card size="small">
            <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[3] }}>
              <Select<DocumentDiscipline>
                allowClear
                placeholder="All disciplines"
                aria-label="Discipline"
                value={discipline}
                onChange={setDiscipline}
                style={{ width: 190 }}
                options={data.disciplines.map((d) => ({ value: d, label: DOCUMENT_DISCIPLINE_LABELS[d] }))}
              />
              <Select<ComponentState>
                allowClear
                placeholder="Any status"
                aria-label="Status"
                value={state}
                onChange={setState}
                style={{ width: 170 }}
                options={COMPONENT_STATES.map((s) => ({ value: s, label: COMPONENT_STATE_LABELS[s] }))}
              />
            </Flex>
            <Table<ComponentRowDto>
              rowKey={(r) => r.workElementId ?? 'loose'}
              size="small"
              pagination={false}
              dataSource={rows}
              columns={columns}
              scroll={{ x: 'max-content' }}
              locale={{
                emptyText: (
                  <EmptyArt art="entries" title={data.rows.length ? 'No component matches these filters' : 'This project has no components yet'}>
                    {data.rows.length ? null : <Typography.Text type="secondary">Lay out its components on the project’s Plan, then link each drawing to its component in the register.</Typography.Text>}
                  </EmptyArt>
                ),
              }}
            />
          </Card>
        </Flex>
      )}
    </div>
  );
}
