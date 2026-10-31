'use client';

import React, { useMemo, useState } from 'react';
import { Button, Input, Progress, Segmented, Select, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { CalculatorOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, EditOutlined, FileExcelOutlined, PlusOutlined } from '@/components/common/icons';
import type { BoqItemDto } from '@erp/shared';
import { canEditProjects, canSetRateAnalysis, canViewReconciliation } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useBoq, useProjectSetup } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatINR, formatINRCompact, formatPct, formatQty, toNumber, RUPEE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { BoqFormModal } from './BoqFormModal';
import { BoqImportModal, downloadBoqTemplate } from './BoqImportModal';
import { LinkBoqModal } from '@/components/activities/LinkBoqModal';
import { BRAND } from '@/lib/brand';
import { themeColor, themeFontSize } from '@/lib/theme';
import { loadXlsx } from '@/lib/exportExcel';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { RateAnalysisDrawer } from '@/components/reconciliation/RateAnalysisDrawer';
import { RateAnalysisImportModal } from '@/components/reconciliation/RateAnalysisImportModal';

export function BoqTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useBoq(projectId);
  // An item-rate BOQ far from the contract value (finding 6 of the October review), as the setup checklist and watch list say.
  const gap = useProjectSetup(projectId).data?.boqGap ?? null;
  const [search, setSearch] = useState('');
  // Bill sections or cost centres (item 125): filter by one, or see their subtotals.
  const [section, setSection] = useState<string | null>(null);
  const [view, setView] = useState<'items' | 'sections'>('items');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BoqItemDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = !!user && canEditProjects(user.roleKey);
  // Rate analysis (v5 item 92): what one unit of each item takes, for the reconciliation and the estimate.
  const analyst = !!user && canViewReconciliation(user.roleKey);
  const rateSetter = !!user && canSetRateAnalysis(user.roleKey);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [importRates, setImportRates] = useState(false);

  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${projectId}/boq/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    meta: FAIL_NOTICE,
  });

  const sections = useMemo(() => [...new Set((data ?? []).map((i) => i.section).filter((x): x is string => !!x))], [data]);
  const bySection = useMemo(() => {
    const total = (data ?? []).reduce((s, i) => s + toNumber(i.amount), 0);
    const rows = [...sections, null].map((name) => {
      const items = (data ?? []).filter((i) => i.section === name);
      const amount = items.reduce((s, i) => s + toNumber(i.amount), 0);
      const executed = items.reduce((s, i) => s + toNumber(i.executedQty) * toNumber(i.rate), 0);
      return { key: name ?? '', name, count: items.length, amount, executed, share: total > 0 ? (amount / total) * 100 : 0 };
    });
    return rows.filter((r) => r.count > 0);
  }, [data, sections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((i) => (!section || i.section === section) && (!q || i.itemNo.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)));
  }, [data, search, section]);

  const totals = useMemo(() => {
    const items = data ?? [];
    const amount = items.reduce((s, i) => s + toNumber(i.amount), 0);
    const executed = items.reduce((s, i) => s + toNumber(i.executedQty) * toNumber(i.rate), 0);
    const measured = items.reduce((s, i) => s + toNumber(i.measuredAmount), 0);
    return { amount, executed, measured, count: items.length };
  }, [data]);

  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(
      (data ?? []).map((i) => ({
        'Item no.': i.itemNo,
        Description: i.description,
        Unit: i.unit,
        Rate: toNumber(i.rate),
        'BOQ qty': toNumber(i.originalQty),
        'Revised qty': i.revisedQty !== null ? toNumber(i.revisedQty) : '',
        'Done qty': toNumber(i.executedQty),
        'Balance qty': toNumber(i.balanceQty),
        'Measured qty': toNumber(i.measuredQty),
        'Measured awaiting approval': toNumber(i.pendingMeasuredQty),
        'Measured value': toNumber(i.measuredAmount),
        Amount: toNumber(i.amount),
        Section: i.section ?? '',
        Component: i.workElementName ?? '',
        'SOR item': i.sorRef ?? '',
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
    XLSX.writeFile(wb, `BOQ-${projectId.slice(0, 8)}.xlsx`);
  };

  const columns: TableProps<BoqItemDto>['columns'] = [
    { title: 'Item', dataIndex: 'itemNo', width: 70, fixed: 'left', sorter: (a, b) => a.sortOrder - b.sortOrder || a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }) },
    {
      title: 'Description',
      dataIndex: 'description',
      ellipsis: { showTitle: false },
      render: (v, r) => (
        <>
          <Tooltip title={v}>{v}</Tooltip>
          {r.section || r.workElementName || r.sorRef ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {[r.section, r.workElementName, r.sorRef && `SOR ${r.sorRef}`].filter(Boolean).join(' · ')}
            </div>
          ) : null}
        </>
      ),
    },
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    { title: 'Rate (₹)', dataIndex: 'rate', width: 120, align: 'right', className: 'mono', render: (v) => formatINR(v, true).replace(RUPEE, '') },
    { title: 'BOQ qty', dataIndex: 'originalQty', width: 100, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    { title: 'Revised qty', dataIndex: 'revisedQty', width: 95, align: 'right', className: 'mono', render: (v) => (v === null ? <span className="text-muted">-</span> : formatQty(v)) },
    {
      title: 'Done',
      dataIndex: 'executedQty',
      width: 140,
      className: 'mono',
      render: (v, r) => {
        const base = toNumber(r.revisedQty ?? r.originalQty);
        const pct = base > 0 ? Math.min(100, Math.round((toNumber(v) / base) * 1000) / 10) : 0;
        return (
          <div>
            <div style={{ textAlign: 'right' }}>{formatQty(v)}</div>
            <Progress percent={pct} size="small" showInfo={false} strokeColor={pct >= 100 ? themeColor('colorSuccess') : BRAND.colors.primary} aria-label={`${pct}% done`} />
          </div>
        );
      },
    },
    {
      title: <Tooltip title="Approved measurement book quantity; awaiting approval below it">Measured</Tooltip>,
      dataIndex: 'measuredQty',
      width: 110,
      align: 'right',
      className: 'mono',
      render: (v, r) => (
        <div>
          <div>{toNumber(v) ? formatQty(v) : <span className="text-muted">-</span>}</div>
          {toNumber(r.pendingMeasuredQty) ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              +{formatQty(r.pendingMeasuredQty)} pending
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Balance', dataIndex: 'balanceQty', width: 90, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', className: 'mono', render: (v) => formatINR(v), sorter: (a, b) => toNumber(a.amount) - toNumber(b.amount) },
    ...(editor || analyst
      ? [
          {
            title: '',
            key: 'actions',
            width: (editor ? 68 : 0) + (analyst ? 36 : 0) + 8,
            fixed: 'right' as const,
            render: (_: unknown, r: BoqItemDto) => (
              <Space size={4}>
                {analyst ? (
                  <Tooltip title="Rate analysis">
                    <Button size="small" type="text" icon={<CalculatorOutlined />} aria-label={`Rate analysis of BOQ item ${r.itemNo}`} onClick={() => setAnalysis(r.id)} />
                  </Tooltip>
                ) : null}
                {editor ? (
                  <>
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      aria-label={`Edit BOQ item ${r.itemNo}`}
                      onClick={() => {
                        setEditing(r);
                        setFormOpen(true);
                      }}
                    />
                    <ConfirmDelete what={`BOQ item ${r.itemNo}`} onConfirm={() => del.mutateAsync(r.id)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete BOQ item ${r.itemNo}`} />
                    </ConfirmDelete>
                  </>
                ) : null}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space size={24} wrap>
          <Statistic title="BOQ items" value={totals.count} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          <Statistic title="BOQ amount" value={formatINR(totals.amount)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          <Statistic title="Value of work done" value={formatINR(totals.executed)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          <Statistic title="Measured value (approved measurements)" value={formatINR(totals.measured)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          {gap ? (
            <p data-testid="boq-gap" style={{ margin: 0, maxWidth: 420, color: themeColor('colorWarningText'), fontSize: themeFontSize('fontSizeSM') }}>
              <ExclamationCircleOutlined aria-hidden style={{ marginRight: 6 }} />
              The BOQ adds up to {formatINRCompact(gap.boqTotal)}, {Math.abs(gap.gapPct)}% {gap.gapPct < 0 ? 'below' : 'above'} the {formatINRCompact(gap.contractValue)} contract value. Work done, earned value and the budget are off until the two agree.
            </p>
          ) : null}
        </Space>
        <Space wrap>
          {sections.length ? (
            <Segmented
              aria-label="Show BOQ items or section totals"
              value={view}
              onChange={(v) => setView(v as 'items' | 'sections')}
              options={[
                { value: 'items', label: 'Items' },
                { value: 'sections', label: 'By section' },
              ]}
            />
          ) : null}
          {sections.length ? (
            <Select
              aria-label="Filter by section"
              allowClear
              placeholder="All sections"
              value={section ?? undefined}
              onChange={(v) => setSection(v ?? null)}
              options={sections.map((x) => ({ value: x, label: x }))}
              style={{ width: 200 }}
            />
          ) : null}
          <Input.Search placeholder="Search item / description" aria-label="Search BOQ items" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!data || data.length === 0}>
            Export
          </Button>
          {rateSetter && data && data.length > 0 ? (
            <Button icon={<CalculatorOutlined />} onClick={() => setImportRates(true)}>
              Import rate analysis
            </Button>
          ) : null}
          {editor && (
            <>
              <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>
                Import BOQ
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                New BOQ item
              </Button>
            </>
          )}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {view === 'sections' && sections.length ? (
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={bySection}
          onRow={(r) => ({
            onClick: () => {
              setSection(r.name);
              setView('items');
            },
            style: { cursor: r.name ? 'pointer' : undefined },
          })}
          columns={[
            {
              title: 'Section',
              dataIndex: 'name',
              render: (v: string | null) =>
                v ? (
                  <Button type="link" style={{ padding: 0 }} onClick={() => setSection(v)}>
                    {v}
                  </Button>
                ) : (
                  <span className="text-muted">No section</span>
                ),
            },
            { title: 'Items', dataIndex: 'count', width: 80, align: 'right' },
            { title: 'Amount', dataIndex: 'amount', width: 160, align: 'right', className: 'mono', render: (v: number) => formatINR(v) },
            { title: 'Share', dataIndex: 'share', width: 90, align: 'right', className: 'mono', render: (v: number) => formatPct(v) },
            {
              title: 'Value of work done',
              dataIndex: 'executed',
              width: 200,
              render: (v: number, r) => {
                const pct = r.amount > 0 ? Math.min(100, Math.round((v / r.amount) * 1000) / 10) : 0;
                return <Progress percent={pct} size="small" aria-label={`${r.name ?? 'No section'}: ${pct}% done`} format={() => formatINR(v)} />;
              },
            },
          ]}
        />
      ) : (
      <Table<BoqItemDto>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filtered}
        size="small"
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: true }}
        scroll={{ x: 1210 }}
        locale={{
          emptyText: (
            <div style={{ padding: 24 }}>
              <Typography.Text type="secondary">No BOQ items yet.</Typography.Text>
              {editor && (
                <div style={{ marginTop: 8 }}>
                  <Button type="link" onClick={downloadBoqTemplate}>
                    Download the Excel template
                  </Button>
                  and import it, or add items manually.
                </div>
              )}
            </div>
          ),
        }}
        summary={() =>
          filtered.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8}>
                  <strong>Total ({filtered.length} items)</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong>{formatINR(filtered.reduce((s, i) => s + toNumber(i.amount), 0))}</strong>
                </Table.Summary.Cell>
                {(editor || analyst) && <Table.Summary.Cell index={9} />}
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
      )}
      <BoqFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} item={editing} sections={sections} />
      <BoqImportModal open={importOpen} onClose={() => setImportOpen(false)} projectId={projectId} onImported={() => setLinkOpen(true)} />
      <LinkBoqModal open={linkOpen} onClose={() => setLinkOpen(false)} projectId={projectId} />
      {analyst ? <RateAnalysisDrawer projectId={projectId} boqItemId={analysis} open={!!analysis} onClose={() => setAnalysis(null)} /> : null}
      {rateSetter ? <RateAnalysisImportModal open={importRates} onClose={() => setImportRates(false)} projectId={projectId} /> : null}
    </div>
  );
}
