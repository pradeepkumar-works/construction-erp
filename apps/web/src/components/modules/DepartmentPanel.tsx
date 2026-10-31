'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Col, Flex, Grid, Row, Table, Typography } from 'antd';
import { PIPELINE_STAGES, type DepartmentPipelineDto, type PipelineRowDto } from '@erp/shared';
import { useDepartmentHome } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { AppTag, type TagTone } from '@/components/common/AppTag';
import { QueryError } from '@/components/common/QueryState';
import { kpiColumns } from '@/components/home/KpiTile';
import { ModuleFigure } from './ModuleFigure';
import s from './DepartmentHome.module.css';

/** A stage's tone: what waits on a decision is pending, part received violet, the rest in hand. */
const STAGE_TONE: Record<string, TagTone> = { APPROVAL: 'pending', SIGN: 'pending', SEAL: 'pending', READY: 'info', PARTLY_RECEIVED: 'violet' };

function Stage({ pipeline, row }: { pipeline: DepartmentPipelineDto; row: PipelineRowDto }) {
  const label = PIPELINE_STAGES[pipeline.key].find((x) => x.key === row.stage)?.label ?? row.stage;
  return (
    <AppTag tone={STAGE_TONE[row.stage] ?? 'neutral'} dot>
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
  const dueTitle = p.key === 'deliveries' ? 'Delivery by' : p.key === 'letters' ? 'Reply by' : 'Needed by';
  return (
    <Card
      size="small"
      title={p.title}
      extra={
        <Link href={p.href} className="text-link">
          Open the list
        </Link>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        {p.note}
      </Typography.Paragraph>
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
              { title: p.key === 'deliveries' ? 'Vendor and items' : p.key === 'letters' ? 'Subject' : 'Items', dataIndex: 'title', render: (v: string) => <span translate="no">{v}</span> },
              { title: 'Stage', key: 'stage', width: 190, render: (_, r) => <Stage pipeline={p} row={r} /> },
              { title: dueTitle, key: 'due', width: 130, render: (_, r) => <Due row={r} /> },
            ]}
          />
          {p.total > p.rows.length && (
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
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
 * A department's figures strip and its pipelines (`@erp/shared/department-home.ts`), for the header's project
 * or every project the user sees. Nothing shows for a department with neither.
 */
export function DepartmentPanel({ department }: { department: string }) {
  const [projectId] = useProjectScope();
  const { data, error, refetch } = useDepartmentHome(department, projectId);
  const screens = Grid.useBreakpoint();
  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data || (!data.figures.length && !data.pipelines.length)) return null;
  const perRow = kpiColumns(data.figures.length, screens);
  return (
    <Flex vertical gap={16}>
      {data.figures.length > 0 && (
        <section aria-label="Department figures">
          <Row gutter={[16, 16]}>
            {data.figures.map((f) => (
              <Col key={f.key} flex={`0 0 ${100 / perRow}%`}>
                <ModuleFigure f={f} />
              </Col>
            ))}
          </Row>
        </section>
      )}
      {data.pipelines.map((p) => (
        <Pipeline key={p.key} p={p} />
      ))}
    </Flex>
  );
}
