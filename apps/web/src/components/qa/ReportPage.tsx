'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { Button, Card, Col, Flex, Row, Statistic, Table, Typography, theme } from 'antd';
import { NCR_AGE_BAND_LABELS, type QaReportDto, type QaReportRowDto } from '@erp/shared';
import { useQaReport } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatINR } from '@/lib/format';
import { DISPLAY_FONT } from '@/lib/theme';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { PrinterOutlined } from '@/components/common/icons';

const pct = (v: number | null) => (v === null ? '-' : `${v}%`);

function Figure({ title, value, href, tone }: { title: string; value: React.ReactNode; href?: string; tone?: 'danger' }) {
  const { token } = theme.useToken();
  const stat = <Statistic title={title} value={value as string} styles={{ content: { fontFamily: DISPLAY_FONT, color: tone ? token.colorErrorText : undefined } }} />;
  return <Card size="small">{href ? <Link href={href} aria-label={title} style={{ color: 'inherit', display: 'block' }}>{stat}</Link> : stat}</Card>;
}

/** Counts by code (category, root cause, age), largest first. */
function Breakdown({ title, rows, empty }: { title: string; rows: { key: string; name: string; count: number }[]; empty: string }) {
  return (
    <Card size="small" title={title}>
      <Table
        rowKey="key"
        size="small"
        showHeader={false}
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: empty }}
        columns={[
          { title: 'What', dataIndex: 'name' },
          { title: 'Count', dataIndex: 'count', align: 'right', width: 80, render: (v: number) => <span translate="no">{v}</span> },
        ]}
      />
    </Card>
  );
}

function ReportBody({ data }: { data: QaReportDto }) {
  const { token } = theme.useToken();
  const t = data.totals;
  return (
    <Flex vertical gap={token.margin}>
      <Row gutter={[token.margin, token.margin]}>
        <Col xs={12} md={6}>
          <Figure title="Tests sampled" value={t.tests} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="Pass rate" value={pct(t.passRate)} tone={t.passRate !== null && t.passRate < 95 ? 'danger' : undefined} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="Tests short of the plan" value={t.short} href="/tests-due" tone={t.short ? 'danger' : undefined} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="NCRs open" value={t.ncrsOpen} href="/inspections?tab=ncrs" tone={t.ncrsOver30 ? 'danger' : undefined} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="NCRs raised / closed" value={`${t.ncrsRaised} / ${t.ncrsClosed}`} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="Rework cost" value={formatINR(t.reworkCost)} />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="Audits and visits" value={t.audits} href="/qa-audits" />
        </Col>
        <Col xs={12} md={6}>
          <Figure title="Findings open" value={t.findingsOpen} href="/qa-audits?open=1" tone={t.findingsOpen ? 'danger' : undefined} />
        </Col>
      </Row>

      <Card size="small" title="By project">
        <Table<QaReportRowDto>
          rowKey="projectId"
          size="small"
          pagination={false}
          dataSource={data.rows}
          scroll={{ x: 1100 }}
          locale={{ emptyText: 'No quality work on a project this month' }}
          columns={[
            { title: 'Project', dataIndex: 'projectName', fixed: 'left', width: 200, render: (v: string, r) => <Link href={`/projects/${r.projectId}`}>{v}</Link> },
            { title: 'Tests', dataIndex: 'tests', align: 'right', width: 70 },
            { title: 'Passed', dataIndex: 'passed', align: 'right', width: 80 },
            { title: 'Failed', dataIndex: 'failed', align: 'right', width: 70 },
            { title: 'Pass rate', dataIndex: 'passRate', align: 'right', width: 90, render: (v: number | null) => pct(v) },
            { title: 'Short', dataIndex: 'short', align: 'right', width: 70 },
            { title: 'NCRs raised', dataIndex: 'ncrsRaised', align: 'right', width: 100 },
            { title: 'Closed', dataIndex: 'ncrsClosed', align: 'right', width: 80 },
            { title: 'Open', key: 'open', align: 'right', width: 110, render: (_, r) => (r.ncrsOver30 ? `${r.ncrsOpen} (${r.ncrsOver30} over 30 days)` : r.ncrsOpen) },
            { title: 'Rework', dataIndex: 'reworkCost', align: 'right', width: 110, render: (v: string) => (Number(v) ? formatINR(v) : '-') },
            { title: 'Audits', dataIndex: 'audits', align: 'right', width: 80 },
            { title: 'Findings open', dataIndex: 'findingsOpen', align: 'right', width: 110 },
            {
              title: 'Cubes failing',
              dataIndex: 'cubesFailing',
              width: 140,
              render: (v: string[]) =>
                v.length ? (
                  <Flex gap={4} wrap>
                    {v.map((g) => (
                      <AppTag key={g} tone="danger">
                        {g}
                      </AppTag>
                    ))}
                  </Flex>
                ) : (
                  '-'
                ),
            },
          ]}
          summary={() =>
            data.rows.length > 1 ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <Typography.Text strong>All projects</Typography.Text>
                </Table.Summary.Cell>
                {[t.tests, t.passed, t.failed, pct(t.passRate), t.short, t.ncrsRaised, t.ncrsClosed, t.ncrsOpen, Number(t.reworkCost) ? formatINR(t.reworkCost) : '-', t.audits, t.findingsOpen, t.cubesFailing || '-'].map((v, i) => (
                  <Table.Summary.Cell key={i} index={i + 1} align={i === 11 ? 'left' : 'right'}>
                    <Typography.Text strong translate="no">
                      {v}
                    </Typography.Text>
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            ) : null
          }
        />
      </Card>

      <Row gutter={[token.margin, token.margin]}>
        <Col xs={24} md={8}>
          <Breakdown title="Open NCRs by age" rows={data.ncrAges.map((a) => ({ key: a.band, name: NCR_AGE_BAND_LABELS[a.band], count: a.count }))} empty="No NCR open" />
        </Col>
        <Col xs={24} md={8}>
          <Breakdown title="NCRs this month by category" rows={data.byCategory.map((c) => ({ key: c.code ?? '-', name: c.name, count: c.count }))} empty="No NCR raised this month" />
        </Col>
        <Col xs={24} md={8}>
          <Breakdown title="NCRs closed this month by root cause" rows={data.byRootCause.map((c) => ({ key: c.code ?? '-', name: c.name, count: c.count }))} empty="No NCR closed this month" />
        </Col>
      </Row>

      <Card size="small" title="Registers today">
        <Table
          rowKey="key"
          size="small"
          showHeader={false}
          pagination={false}
          dataSource={[
            { key: 'calibration', text: `${data.instrumentsOverdue} instrument${data.instrumentsOverdue === 1 ? '' : 's'} out of calibration, ${data.instrumentsDueSoon} due within 30 days`, href: '/calibration', link: 'Calibration' },
            { key: 'samples', text: `${data.samplesLate} lab report${data.samplesLate === 1 ? '' : 's'} late`, href: '/lab-samples', link: 'Samples sent out' },
            { key: 'certificates', text: `${data.certificatesMissing} receipt${data.certificatesMissing === 1 ? '' : 's'} without the maker's test certificate`, href: '/test-certificates', link: 'Test certificates' },
            { key: 'labs', text: data.labsExpiring.length ? `NABL accreditation running out: ${data.labsExpiring.join(', ')}` : 'No lab accreditation running out', href: '/qa-labs', link: 'Labs' },
          ]}
          columns={[
            { title: 'Register', dataIndex: 'text' },
            { title: 'Open', key: 'open', align: 'right', width: 160, render: (_, r) => <Link href={r.href}>{r.link}</Link> },
          ]}
        />
      </Card>
    </Flex>
  );
}

/** The month's quality report: tests and pass rate, NCRs by age, category and root cause, rework, audits and the registers, by project. */
export function ReportPage() {
  const { token } = theme.useToken();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [projectId, setProjectId] = useProjectScope();
  const { data, isLoading, error, refetch } = useQaReport(month, projectId);
  return (
    <div className="page-container">
      <PageHeader
        title="Quality report"
        subtitle="The month's tests and pass rate, NCRs by age and cause, rework, audits and the registers, by project."
        extra={
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      <Flex gap={token.marginSM} wrap align="center" style={{ marginBottom: token.margin }}>
        <DatePicker
          picker="month"
          format="MMM YYYY"
          allowClear={false}
          aria-label="Month"
          value={dayjs(`${month}-01`)}
          onChange={(d) => d && setMonth(d.format('YYYY-MM'))}
          disabledDate={(d) => d.isAfter(dayjs(), 'month')}
        />
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} aria-label="Project" style={{ minWidth: 240, maxWidth: '100%' }} />
      </Flex>
      {isLoading ? <PageSkeleton shape="home" header={false} /> : error || !data ? <QueryError error={error} onRetry={() => refetch()} /> : <ReportBody data={data} />}
    </div>
  );
}
