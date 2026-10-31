'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Checkbox, Flex, Statistic, Table, Typography, theme } from 'antd';
import { canRecordTest, type TestsDueRowDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useTestsDue } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { TestFormModal, type TestPrefill } from '@/components/quality/TestFormModal';
import { WitnessTag, lineCovers, lineFrequency } from './qaUi';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

const unitOf = (r: TestsDueRowDto) => (r.line.source === 'RECEIPT' ? `in ${r.occasions} lot${r.occasions === 1 ? '' : 's'}` : r.unit ?? '');

/**
 * Tests due (item 137): what each line of the quality plans owes from the approved work and the material received,
 * against the tests taken under it; a short line records its test from here.
 */
export function TestsDuePage() {
  const { token } = theme.useToken();
  const { user } = useAuth();
  const [projectId, setProjectId] = useProjectScope();
  const [short, setShort] = useState(false);
  const { data, isLoading, error, refetch } = useTestsDue(projectId, short);
  const [prefill, setPrefill] = useState<(TestPrefill & { projectId: string }) | null>(null);
  const canRecord = !!user && canRecordTest(user.roleKey);

  return (
    <div className="page-container">
      <PageHeader
        title="Tests due"
        subtitle="Tests owed under each quality plan: concrete cubes by IS 456 for each grade and day, field tests by quantity, material by the lot, against the tests taken."
        extra={<LinkButton href="/quality-plan">Quality plan</LinkButton>}
      />
      <Card>
        <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
          <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} style={{ minWidth: 240, maxWidth: '100%' }} />
          <Checkbox checked={short} onChange={(e) => setShort(e.target.checked)}>
            Only tests still owed
          </Checkbox>
        </Flex>
        {isLoading ? (
          <PageSkeleton shape="list" />
        ) : error || !data ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <>
            <Flex gap={token.marginXL} wrap style={{ marginBottom: token.margin }}>
              <Statistic title="Owed" value={data.required} />
              <Statistic title="Sampled" value={data.taken} />
              <Statistic title="Short" value={data.short} styles={{ content: data.short ? { color: token.colorErrorText } : undefined }} />
            </Flex>
            <Table<TestsDueRowDto>
              rowKey={(r) => r.line.id}
              size="middle"
              dataSource={data.rows}
              pagination={false}
              scroll={{ x: 1100 }}
              locale={{ emptyText: short ? 'No test is short.' : 'No project you work on has a quality plan yet.' }}
              columns={[
                ...(projectId ? [] : [{ title: 'Project', dataIndex: 'projectName', width: 180, ellipsis: true } as const]),
                {
                  title: 'Test',
                  key: 'test',
                  width: 260,
                  render: (_, r) => (
                    <Flex vertical gap={2}>
                      <Typography.Text strong>{r.line.testName}</Typography.Text>
                      <Typography.Text type="secondary">{lineCovers(r.line)}</Typography.Text>
                    </Flex>
                  ),
                },
                { title: 'How often', key: 'freq', width: 150, render: (_, r) => <span translate="no">{lineFrequency(r.line)}</span> },
                {
                  title: 'Done',
                  key: 'done',
                  width: 150,
                  align: 'right',
                  render: (_, r) => (r.quantity ? <span translate="no">{`${Number(r.quantity).toLocaleString('en-IN')} ${unitOf(r)}`}</span> : <Typography.Text type="secondary">Nothing yet</Typography.Text>),
                },
                { title: 'Owed', dataIndex: 'required', width: 80, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
                { title: 'Sampled', dataIndex: 'taken', width: 80, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
                {
                  title: 'Short',
                  dataIndex: 'short',
                  width: 90,
                  align: 'right',
                  render: (v: number) => (v ? <AppTag tone="danger">{`${v} short`}</AppTag> : <Typography.Text type="secondary">-</Typography.Text>),
                },
                { title: 'Last test', dataIndex: 'lastTestOn', width: 120, render: (v: string | null) => (v ? formatDate(v) : '-') },
                { title: 'Witness', key: 'witness', width: 170, render: (_, r) => <WitnessTag line={r.line} /> },
                ...(canRecord
                  ? [
                      {
                        title: <span style={srOnly}>Record</span>,
                        key: 'record',
                        width: 130,
                        render: (_: unknown, r: TestsDueRowDto) => (
                          <Button
                            size="small"
                            onClick={() => setPrefill({ projectId: r.line.projectId, testTypeCode: r.line.testType, planLineId: r.line.id, title: r.line.grade ? `${r.line.grade} ${r.line.testName.toLowerCase()}` : undefined, note: `Counts under ${r.line.testName} in the quality plan of ${r.projectName}.` })}
                            aria-label={`Record ${r.line.testName} for ${r.projectName}`}
                          >
                            Record test
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {data.withoutPlan.length ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: token.margin, marginBottom: 0 }}>
                {data.withoutPlan.length === 1 ? `${data.withoutPlan[0].name} has` : `${data.withoutPlan.length} projects have`} no quality plan yet, so nothing is counted for{' '}
                {data.withoutPlan.length === 1 ? 'it' : 'them'}. <Link href="/quality-plan" className="text-link">Set up a quality plan</Link>
              </Typography.Paragraph>
            ) : null}
          </>
        )}
      </Card>
      <TestFormModal open={!!prefill} onClose={() => setPrefill(null)} projectId={prefill?.projectId} prefill={prefill} />
    </div>
  );
}
