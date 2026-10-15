'use client';

import React, { useState } from 'react';
import { Alert, Button, Checkbox, Segmented, Select, Space, Statistic, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { RiskCategory, RiskDto, RiskKind, RiskSortField, RiskStatus } from '@erp/shared';
import { RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_STATUSES, RISK_STATUS_LABELS, canRaiseRisk } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useRisks, useRiskSuggestions, useRiskSummary } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { RISK_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { RiskTable } from './RiskTable';
import { RiskDrawer } from './RiskDrawer';
import { RiskFormModal, type RiskPrefill } from './RiskFormModal';
import { RiskHeatMap } from './RiskHeatMap';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

type StatusFilter = RiskStatus | 'ACTIVE' | 'ALL';
const big = { content: { fontSize: 18 } };

/** Delay and risk register with totals and the heat map; the Delays & Risks page and a project tab. */
export function RiskList({ projectId: fixedProject, initialProject, initialOpenId }: { projectId?: string; initialProject?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const list = useListState<RiskSortField>({ sortBy: 'score', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>(initialProject);
  const [kind, setKind] = useState<RiskKind | 'ALL'>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [category, setCategory] = useState<RiskCategory | undefined>();
  const [mine, setMine] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<RiskPrefill | null>(null);
  const [editing, setEditing] = useState<RiskDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = {
    ...list.params,
    projectId,
    kind: kind === 'ALL' ? undefined : kind,
    status: status === 'ACTIVE' || status === 'ALL' ? undefined : status,
    active: status === 'ACTIVE' || undefined,
    category,
    mine: mine || undefined,
    overdue: overdue || undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useRisks(filters);
  const { data: summary } = useRiskSummary(filters);
  const mayRaise = !!user && canRaiseRisk(user.roleKey);
  const { data: suggestions } = useRiskSuggestions(projectId, mayRaise);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };
  const raise = (p: RiskPrefill | null) => {
    setPrefill(p);
    setFormOpen(true);
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<RiskDto>('/risks', { ...filters });
    downloadXlsx(exportFileName('delay-risk-register'), 'register', RISK_EXPORT, rows);
    return rows.length;
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., title, action"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayRaise ? (
              <>
                <Button icon={<PlusOutlined />} onClick={() => raise({ kind: 'DELAY', projectId })}>
                  Record delay
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => raise({ kind: 'RISK', projectId })}>
                  Raise risk
                </Button>
              </>
            ) : null}
          </>
        }
      >
        <Segmented
          value={kind}
          onChange={(v) => reset(setKind)(v as RiskKind | 'ALL')}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DELAY', label: 'Delays' },
            { value: 'RISK', label: 'Risks' },
          ]}
        />
        <Select
          style={{ width: 170 }}
          value={status}
          onChange={reset(setStatus)}
          options={[{ value: 'ACTIVE', label: 'Open + monitoring' }, ...RISK_STATUSES.map((s) => ({ value: s, label: RISK_STATUS_LABELS[s] })), { value: 'ALL', label: 'All statuses' }]}
        />
        <Select allowClear placeholder="All categories" style={{ width: 190 }} value={category} onChange={reset(setCategory)} options={RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABELS[c] }))} />
        <Checkbox checked={mine} onChange={(e) => reset(setMine)(e.target.checked)}>
          Mine
        </Checkbox>
        <Checkbox checked={overdue} onChange={(e) => reset(setOverdue)(e.target.checked)}>
          Overdue
        </Checkbox>
      </ListToolbar>
      {mayRaise && suggestions?.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ margin: '12px 16px 0' }}
          title={`${suggestions.length} activit${suggestions.length === 1 ? 'y is' : 'ies are'} past the planned finish with no delay recorded`}
          description={
            <Space size={[6, 6]} wrap>
              {suggestions.slice(0, 8).map((s) => (
                <Tooltip key={s.activityId} title={`${s.projectName}: planned finish ${formatDate(s.plannedEnd)}, ${s.progressPct}% done`}>
                  <Tag style={{ cursor: 'pointer' }} color="orange" onClick={() => raise({ kind: 'DELAY', projectId: s.projectId, activityId: s.activityId, title: `${s.activityName} behind schedule` })}>
                    {s.activityName} · {s.daysLate} d late · record delay
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          }
        />
      ) : null}
      {summary ? (
        <CardToolbar variant="summary" wrap gap={32} align="flex-start">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', flex: 1, minWidth: 300 }}>
            <Statistic title="Open" value={summary.open} styles={big} />
            <Statistic title="Monitoring" value={summary.monitoring} styles={big} />
            <Statistic title="High risks" value={summary.highRisks} styles={{ content: { fontSize: 18, color: summary.highRisks ? themeColor('colorErrorText') : undefined } }} />
            <Statistic title="Delays holding up work" value={summary.openDelays} styles={{ content: { fontSize: 18, color: summary.openDelays ? themeColor('volcano7') : undefined } }} />
            <Statistic
              title={
                <Tooltip title="Days lost to delays caused by the client, third parties or force majeure can support an extension-of-time claim">
                  Days lost (excusable)
                </Tooltip>
              }
              value={`${summary.daysLost} (${summary.excusableDaysLost})`}
              styles={big}
            />
            <Statistic title="Overdue actions" value={summary.overdue} styles={{ content: { fontSize: 18, color: summary.overdue ? themeColor('colorErrorText') : undefined } }} />
            <Statistic title="Closed" value={summary.closed} styles={big} />
            <div style={{ flexBasis: '100%' }}>
              <Space size={[4, 4]} wrap>
                {summary.byCategory.map((c) => (
                  <Tooltip key={c.category} title={`${c.total} in all${c.daysLost ? `, ${c.daysLost} day(s) lost` : ''}`}>
                    <Tag style={{ cursor: 'pointer' }} color={category === c.category ? 'blue' : undefined} onClick={() => reset(setCategory)(category === c.category ? undefined : c.category)}>
                      {RISK_CATEGORY_LABELS[c.category]}: {c.open} open
                    </Tag>
                  </Tooltip>
                ))}
                {!summary.byCategory.length ? <Typography.Text type="secondary">Nothing raised yet.</Typography.Text> : null}
              </Space>
            </div>
          </div>
          <RiskHeatMap heat={summary.heat} />
        </CardToolbar>
      ) : null}
      <RiskTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<RiskDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <RiskDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <RiskFormModal
        open={formOpen || !!editing}
        risk={editing}
        prefill={prefill}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setPrefill(null);
        }}
        projectId={fixedProject}
      />
    </>
  );
}
