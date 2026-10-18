'use client';

import React, { useState } from 'react';
import { Alert, Button, Checkbox, Segmented, Select, Space, Statistic, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { RiskCategory, RiskDto, RiskKind, RiskSortField, RiskStatus } from '@erp/shared';
import { LIST_SORT_FIELDS, RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_STATUSES, RISK_STATUS_LABELS, canRaiseRisk } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { useRisks, useRiskSuggestions, useRiskSummary } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { RISK_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { riskColumns } from './RiskTable';
import { RiskDrawer } from './RiskDrawer';
import { RiskFormModal, type RiskPrefill } from './RiskFormModal';
import { RiskHeatMap } from './RiskHeatMap';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor, themeFontSize } from '@/lib/theme';

type StatusFilter = RiskStatus | 'ACTIVE' | 'ALL';
const big = { content: { fontSize: themeFontSize('fontSizeXL') } };
const KEYS = ['kind', 'status', 'category', 'mine', 'overdue'] as const;

/** Delay and risk register with totals and the heat map; the Delays and risks page and a project tab. */
export function RiskList({ projectId: fixedProject, initialProject, initialOpenId }: { projectId?: string; initialProject?: string; initialOpenId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<RiskPrefill | null>(null);
  const [editing, setEditing] = useState<RiskDto | null>(null);
  const frame = useListFrame<RiskSortField, RiskDto>({
    list: 'risks',
    keys: KEYS,
    sortBy: 'score',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.risks,
    fixedProject,
    initialProject,
    // With no status filter the register shows what is open or being watched.
    allLabel: 'Open',
    moreViews: [
      { key: 'delays', label: 'Delays', filters: { kind: 'DELAY' } },
      { key: 'risks', label: 'Risks', filters: { kind: 'RISK' } },
      { key: 'mine', label: 'Mine', filters: { mine: '1' } },
      { key: 'overdue', label: 'Overdue', filters: { overdue: '1' } },
      { key: 'closed', label: 'Closed', filters: { status: 'CLOSED' } },
    ],
    statusLabels: { ...RISK_STATUS_LABELS, ALL: 'All statuses' },
    chipLabels: {
      kind: (v) => (v === 'DELAY' ? 'Delays' : 'Risks'),
      category: (v) => `Category: ${RISK_CATEGORY_LABELS[v as RiskCategory] ?? v}`,
      overdue: () => 'Overdue',
    },
    columns: (sortOrderFor) => riskColumns({ user, showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
  });
  const { page } = frame;
  const projectId = frame.projectId;
  const kind = (page.filters.kind as RiskKind | undefined) ?? 'ALL';
  const status = (page.filters.status as StatusFilter | undefined) ?? 'ACTIVE';
  const category = page.filters.category as RiskCategory | undefined;
  const mine = page.filters.mine === '1';
  const overdue = page.filters.overdue === '1';
  const filters = {
    page: page.params.page,
    pageSize: page.params.pageSize,
    q: page.params.q,
    sortBy: page.params.sortBy,
    sortOrder: page.params.sortOrder,
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
  const raise = (p: RiskPrefill | null) => {
    setPrefill(p);
    setFormOpen(true);
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<RiskDto>('/risks', { ...filters });
    await downloadXlsx(exportFileName('delay-risk-register'), 'register', RISK_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('risk', mayRaise, () => raise(null));

  const newButton = mayRaise ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => raise({ kind: 'RISK', projectId })}>
      New risk
    </Button>
  ) : null;

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search no., title, action"
        searchLabel="Search risks"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayRaise ? (
              <Button icon={<PlusOutlined />} onClick={() => raise({ kind: 'DELAY', projectId })}>
                Record delay
              </Button>
            ) : null}
            {newButton}
          </>
        }
      >
        <Segmented
          value={kind}
          onChange={(v) => page.setFilter('kind', v === 'ALL' ? undefined : v)}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'DELAY', label: 'Delays' },
            { value: 'RISK', label: 'Risks' },
          ]}
        />
        <Select<StatusFilter>
          style={{ width: 170 }}
          aria-label="Status"
          value={status}
          onChange={(v) => page.setFilter('status', v === 'ACTIVE' ? undefined : v)}
          options={[{ value: 'ACTIVE', label: 'Open + monitoring' }, ...RISK_STATUSES.map((s) => ({ value: s, label: RISK_STATUS_LABELS[s] })), { value: 'ALL', label: 'All statuses' }]}
        />
        <Select<RiskCategory> allowClear placeholder="All categories" aria-label="Category" style={{ width: 190 }} value={category} onChange={(v) => page.setFilter('category', v)} options={RISK_CATEGORIES.map((c) => ({ value: c, label: RISK_CATEGORY_LABELS[c] }))} />
        <Checkbox checked={mine} onChange={(e) => page.setFilter('mine', e.target.checked ? '1' : undefined)}>
          Mine
        </Checkbox>
        <Checkbox checked={overdue} onChange={(e) => page.setFilter('overdue', e.target.checked ? '1' : undefined)}>
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
                  <Button size="small" onClick={() => raise({ kind: 'DELAY', projectId: s.projectId, activityId: s.activityId, title: `${s.activityName} behind schedule` })}>
                    {s.activityName} · {s.daysLate} d late · record delay
                  </Button>
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
            <Statistic title="High risks" value={summary.highRisks} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: summary.highRisks ? themeColor('colorErrorText') : undefined } }} />
            <Statistic title="Delays holding up work" value={summary.openDelays} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: summary.openDelays ? themeColor('volcano7') : undefined } }} />
            <Statistic
              title={
                <Tooltip title="Days lost to delays caused by the client, third parties or force majeure can support an extension-of-time claim">
                  Days lost (excusable)
                </Tooltip>
              }
              value={`${summary.daysLost} (${summary.excusableDaysLost})`}
              styles={big}
            />
            <Statistic title="Overdue actions" value={summary.overdue} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: summary.overdue ? themeColor('colorErrorText') : undefined } }} />
            <Statistic title="Closed" value={summary.closed} styles={big} />
            <div style={{ flexBasis: '100%' }}>
              <Space size={[4, 4]} wrap>
                {summary.byCategory.map((c) => (
                  <Tooltip key={c.category} title={`${c.total} in all${c.daysLost ? `, ${c.daysLost} day(s) lost` : ''}`}>
                    <Tag.CheckableTag checked={category === c.category} onChange={(on) => page.setFilter('category', on ? c.category : undefined)}>
                      {RISK_CATEGORY_LABELS[c.category]}: {c.open} open
                    </Tag.CheckableTag>
                  </Tooltip>
                ))}
                {!summary.byCategory.length ? <Typography.Text type="secondary">Nothing raised yet.</Typography.Text> : null}
              </Space>
            </div>
          </div>
          <RiskHeatMap heat={summary.heat} />
        </CardToolbar>
      ) : null}
      <DataTable<RiskDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<RiskDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[exportSelected<RiskDto>('delay-risk-register', 'register', RISK_EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={fixedProject ? 1150 : 1350}
        emptyText={<EmptyArt art="entries" title={kind !== 'ALL' || status !== 'ACTIVE' || category || mine || overdue || page.params.q ? 'Nothing matches these filters' : 'No delays or risks open'} />}
        emptyAction={newButton}
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
        defaultProjectId={frame.projectId}
      />
    </>
  );
}
