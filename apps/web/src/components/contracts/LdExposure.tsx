'use client';

import React from 'react';
import Link from 'next/link';
import { Alert, Descriptions, Flex, Statistic, Table, Tag, Typography, theme } from 'antd';
import type { LdExposureDto } from '@erp/shared';
import { LD_PERIOD_LABELS, PROJECT_STATUS_LABELS } from '@erp/shared';
import { useLdExposure } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { themeFontSize } from '@/lib/theme';

const rateLine = (ld: LdExposureDto) => (Number(ld.ldRatePct) > 0 ? `${ld.ldRatePct}% ${LD_PERIOD_LABELS[ld.ldPeriod]}, capped at ${ld.ldCapPct}%` : 'No LD rate in the contract');

/** One project's liquidated damages exposure (v4 item 50), on its Contract tab. */
export function LdExposureCard({ ld }: { ld: LdExposureDto }) {
  const { token } = theme.useToken();
  const noRate = Number(ld.ldRatePct) === 0;
  return (
    <Flex vertical gap={12} className="ld-exposure">
      {noRate ? <Alert type="info" showIcon title="Add the LD rate and cap from the contract to see what late completion would cost." /> : null}
      <Flex gap={32} wrap>
        <Statistic title="Days late" value={ld.daysLate} suffix={ld.completedOn ? 'at completion' : 'today'} styles={{ content: ld.daysLate ? { color: token.colorErrorText } : undefined }} />
        <Statistic title="LD to date" value={formatINR(ld.ldToDate)} styles={{ content: Number(ld.ldToDate) ? { color: token.colorErrorText } : undefined }} />
        <Statistic title="Forecast LD" value={formatINR(ld.ldForecast)} styles={{ content: Number(ld.ldForecast) ? { color: token.colorWarningText } : undefined }} />
        <Statistic title="If pending extensions are granted" value={formatINR(ld.ldForecastWithEot)} />
      </Flex>
      <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }} bordered>
        <Descriptions.Item label="LD terms">{rateLine(ld)}</Descriptions.Item>
        <Descriptions.Item label="On contract value">{formatINR(ld.contractValue)}</Descriptions.Item>
        <Descriptions.Item label="Cap">
          {formatINR(ld.ldCap)} {ld.capReached ? <Tag color="red">Forecast reaches the cap</Tag> : null}
        </Descriptions.Item>
        <Descriptions.Item label="Completion with extensions">{formatDate(ld.revisedEndDate)}</Descriptions.Item>
        <Descriptions.Item label={ld.completedOn ? 'Completed' : 'Forecast finish'}>
          {formatDate(ld.completedOn ?? ld.forecastFinish)}
          {!ld.completedOn && ld.forecastDaysLate ? <Typography.Text type="danger"> ({ld.forecastDaysLate} days late)</Typography.Text> : null}
        </Descriptions.Item>
        <Descriptions.Item label="Days lost (delay register)">
          {ld.excusableDaysLost} not ours, {ld.contractorDaysLost} ours
        </Descriptions.Item>
        <Descriptions.Item label="Extension still to claim" span={3}>
          {ld.eotPendingDays ? (
            <Typography.Text type="warning">
              {ld.eotPendingDays} days lost to the client, third parties or force majeure are not yet covered by extensions granted.
            </Typography.Text>
          ) : (
            'None'
          )}
        </Descriptions.Item>
      </Descriptions>
    </Flex>
  );
}

/** Liquidated damages exposure across projects (v4 item 50), on the Delays & Risks page. */
export function LdExposureTable() {
  const { data, isLoading, error, refetch } = useLdExposure();
  const rows = data ?? [];
  const total = (k: 'ldToDate' | 'ldForecast') => rows.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <Flex vertical gap={12} className="ld-exposure-table">
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      <Flex gap={32} wrap style={{ padding: '8px 12px 0' }}>
        <Statistic title="Projects late" value={rows.filter((r) => r.daysLate > 0).length} />
        <Statistic title="LD to date" value={formatINR(String(total('ldToDate')))} />
        <Statistic title="Forecast LD" value={formatINR(String(total('ldForecast')))} />
        <Statistic title="Extension days still to claim" value={rows.reduce((s, r) => s + r.eotPendingDays, 0)} />
      </Flex>
      <Table<LdExposureDto>
        size="middle"
        rowKey="projectId"
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1000 }}
        locale={{ emptyText: 'No project has both a contract value and a completion date' }}
        columns={[
          {
            title: 'Project',
            key: 'project',
            render: (_, r) => (
              <div>
                <Link href={`/projects/${r.projectId}?tab=contract`}>{r.projectName}</Link>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    {r.projectCode} · {PROJECT_STATUS_LABELS[r.projectStatus]} · {rateLine(r)}
                  </Typography.Text>
                </div>
              </div>
            ),
          },
          { title: 'Completion with extensions', dataIndex: 'revisedEndDate', width: 150, render: (v: string, r) => <span>{formatDate(v)}{r.extensionDays ? <Typography.Text type="secondary"> (+{r.extensionDays})</Typography.Text> : null}</span> },
          { title: 'Days late', dataIndex: 'daysLate', width: 100, align: 'right', render: (v: number) => (v ? <Typography.Text type="danger">{v}</Typography.Text> : 0) },
          { title: 'Forecast late', dataIndex: 'forecastDaysLate', width: 110, align: 'right' },
          { title: 'LD to date', dataIndex: 'ldToDate', width: 140, align: 'right', render: (v: string) => formatINR(v) },
          { title: 'Forecast LD', dataIndex: 'ldForecast', width: 150, align: 'right', render: (v: string, r) => <span>{formatINR(v)} {r.capReached ? <Tag color="red">cap</Tag> : null}</span> },
          { title: 'Extension to claim', dataIndex: 'eotPendingDays', width: 140, align: 'right', render: (v: number) => (v ? <Typography.Text type="warning">{v} days</Typography.Text> : '-') },
        ]}
      />
    </Flex>
  );
}
