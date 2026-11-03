'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Flex, Segmented, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { AS_BUILT_STATES, DOCUMENT_DISCIPLINE_LABELS, REVISION_STATUS_LABELS, type AsBuiltDueDto, type AsBuiltState, type DocumentDiscipline } from '@erp/shared';
import { useAsBuiltDue } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { useUrlTab } from '@/lib/url-state';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { EmptyArt } from '@/components/common/EmptyArt';

const STATE_LABELS: Record<AsBuiltState, string> = { DUE: 'Due', RECEIVED: 'Received' };
const LEAD: Record<AsBuiltState, string> = {
  DUE: 'Good for construction in the register, so site built from them, and no as-built revision yet.',
  RECEIVED: 'Drawings whose current revision is the as-built one.',
};
const EMPTY: Record<AsBuiltState, string> = {
  DUE: 'Every drawing built from has its as-built revision',
  RECEIVED: 'No as-built revision yet. Add one from the drawing in the register.',
};

/** As-built drawings: what the handover still owes, and what has come in. */
export function AsBuiltPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useProjectScope(useSearchParams().get('projectId') ?? undefined);
  const [state, setState] = useUrlTab<AsBuiltState>(AS_BUILT_STATES, 'DUE', { param: 'state' });
  const { data, isLoading, error, refetch } = useAsBuiltDue(projectId, state);
  const open = (d: AsBuiltDueDto) => router.push(`/documents?id=${d.documentId}`);
  return (
    <div className="page-container">
      <PageHeader title="As-built drawings" subtitle="Each drawing site built from needs an as-built revision before handover." />
      <Card size="small">
        <Flex vertical gap={tk.space[4]}>
          <Flex gap={tk.space[3]} wrap align="center">
            <Segmented<AsBuiltState> aria-label="Which drawings" value={state} onChange={setState} options={AS_BUILT_STATES.map((s) => ({ value: s, label: STATE_LABELS[s] }))} />
            <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" placeholder="All projects" style={{ minWidth: 240, maxWidth: '100%' }} />
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            {LEAD[state]}
          </Typography.Paragraph>
          {isLoading ? (
            <PageSkeleton shape="list" header={false} />
          ) : error || !data ? (
            <QueryError error={error} onRetry={() => refetch()} />
          ) : (
            <Table<AsBuiltDueDto>
              rowKey="documentId"
              size="small"
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              dataSource={data}
              scroll={{ x: 900 }}
              rowClassName={() => 'row-click'}
              onRow={(d) => ({ onClick: (e) => !(e.target as HTMLElement).closest('a') && open(d) })}
              locale={{ emptyText: <EmptyArt art="entries" title={EMPTY[state]} /> }}
              columns={[
                {
                  title: 'Drawing',
                  key: 'drawing',
                  render: (_, d) => (
                    <div>
                      <Link href={`/documents?id=${d.documentId}`} translate="no">
                        {d.docNo}
                      </Link>
                      <Typography.Text type="secondary" style={{ display: 'block' }}>
                        {d.title}
                      </Typography.Text>
                    </div>
                  ),
                },
                { title: 'Project', dataIndex: 'projectName', width: 220, ellipsis: true, render: (v: string) => <span translate="no">{v}</span> },
                { title: 'Discipline', dataIndex: 'discipline', width: 150, render: (v: DocumentDiscipline) => DOCUMENT_DISCIPLINE_LABELS[v] },
                { title: 'Current revision', key: 'rev', width: 230, render: (_, d) => <span translate="no">{`${d.revision}, ${REVISION_STATUS_LABELS[d.status]}`}</span> },
                { title: 'Issued', dataIndex: 'issuedOn', width: 120, render: (v: string) => formatDate(v) },
              ]}
            />
          )}
        </Flex>
      </Card>
    </div>
  );
}
