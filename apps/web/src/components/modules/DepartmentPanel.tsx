'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Flex, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { PIPELINE_STAGES, type DepartmentPipelineDto, type PipelineRowDto, type StatusOf } from '@erp/shared';
import { useDepartmentHome } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { QueryError } from '@/components/common/QueryState';
import { Figures } from '@/components/figures';
import { TitleHelp } from '@/components/common/Help';
import s from './DepartmentHome.module.css';

function Stage({ pipeline, row }: { pipeline: DepartmentPipelineDto; row: PipelineRowDto }) {
  const label = PIPELINE_STAGES[pipeline.key].find((x) => x.key === row.stage)?.label ?? row.stage;
  return (
    <AppTag kind="pipelineStage" status={row.stage as StatusOf<'pipelineStage'>}>
      {label}
    </AppTag>
  );
}

function Due({ row }: { row: PipelineRowDto }) {
  if (!row.dueOn) return row.since ? <span className="text-muted">Since {formatDate(row.since)}</span> : <span className="text-muted">-</span>;
  return (
    <span>
      <span translate="no">{formatDate(row.dueOn)}</span>
      {row.daysLate > 0 && (
        <Typography.Text type="danger" style={{ display: 'block' }}>
          {row.daysLate === 1 ? '1 day late' : `${row.daysLate} days late`}
        </Typography.Text>
      )}
    </span>
  );
}

/** One pipeline: how many stand at each stage, then the most urgent entries. */
function Pipeline({ p }: { p: DepartmentPipelineDto }) {
  const dueTitle = p.key === 'deliveries' ? 'Delivery by' : p.key === 'letters' ? 'Reply by' : p.key === 'salaries' ? 'Pay by' : 'Needed by';
  return (
    <Card
      size="small"
      title={<TitleHelp help={p.note}>{p.title}</TitleHelp>}
      extra={
        <Link href={p.href} className="text-link">
          Open the list
        </Link>
      }
    >
      <ol className={s.stages} aria-label={`${p.title} by stage`}>
        {p.stages.map((st) => (
          <li key={st.key} className={s.stage}>
            <span className={s.stageCount} translate="no">
              {st.count}
            </span>
            <span className={s.stageLabel}>{st.label}</span>
          </li>
        ))}
      </ol>
      {p.rows.length ? (
        <>
          <Table<PipelineRowDto>
            size="small"
            rowKey={(r) => `${r.stage}:${r.id}`}
            pagination={false}
            dataSource={p.rows}
            scroll={{ x: 760 }}
            columns={[
              {
                title: 'Number',
                dataIndex: 'number',
                width: 150,
                render: (v: string, r) => (
                  <Link href={r.href} className="link-strong" translate="no">
                    {v}
                  </Link>
                ),
              },
              { title: 'Project', dataIndex: 'projectName', width: 180, render: (v: string | null) => (v ? <span translate="no">{v}</span> : <span className="text-muted">Head office</span>) },
              { title: p.key === 'deliveries' ? 'Vendor and items' : p.key === 'letters' ? 'Subject' : p.key === 'salaries' ? 'What' : 'Items', dataIndex: 'title', render: (v: string) => <span translate="no">{v}</span> },
              { title: 'Stage', key: 'stage', width: 190, render: (_, r) => <Stage pipeline={p} row={r} /> },
              { title: dueTitle, key: 'due', width: 130, render: (_, r) => <Due row={r} /> },
            ]}
          />
          {p.total > p.rows.length && (
            <Typography.Paragraph type="secondary" style={{ margin: `${tk.space[2]} 0 0` }}>
              The {p.rows.length} most urgent of {p.total}.
            </Typography.Paragraph>
          )}
        </>
      ) : (
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Nothing in flight.
        </Typography.Paragraph>
      )}
    </Card>
  );
}

/**
 * A department's figures strip (`@erp/shared/department-home.ts`), for the header's project or every project the user
 * sees: the screen's answer, so it comes first. Nothing shows for a department without figures.
 */
export function DepartmentFigures({ department }: { department: string }) {
  const [projectId] = useProjectScope();
  const { data, error, refetch } = useDepartmentHome(department, projectId);
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data?.figures.length) return null;
  return <Figures label="Department figures" figures={data.figures} scope={{ projectId }} />;
}

/** A department's pipelines, from the same answer as its figures (a failure shows once, with the figures). */
export function DepartmentPipelines({ department }: { department: string }) {
  const [projectId] = useProjectScope();
  const { data } = useDepartmentHome(department, projectId);
  if (!data?.pipelines.length) return null;
  return (
    <Flex vertical gap={16}>
      {data.pipelines.map((p) => (
        <Pipeline key={p.key} p={p} />
      ))}
    </Flex>
  );
}
