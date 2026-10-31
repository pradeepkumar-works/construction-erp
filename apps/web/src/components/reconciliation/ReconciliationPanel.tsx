'use client';

import React, { useState } from 'react';
import { Alert, Button, Col, Empty, Row, Skeleton, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { AppTabs } from '@/components/common/AppTabs';
import type { TableProps } from 'antd';
import { DeleteOutlined, EditOutlined, FileExcelOutlined, PlusOutlined } from '@/components/common/icons';
import type { ActivityNormDto, FrontFlag, MaterialNormDto, ReconciliationItemDto, ReconciliationLineDto, ReconciliationStatus, UnreconciledItemDto } from '@erp/shared';
import { FRONT_FLAG_HINTS, FRONT_FLAG_LABELS, RECONCILIATION_STATUS_HINTS, RECONCILIATION_STATUS_LABELS, RECONCILIATION_UNDER_PCT, canViewCost } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useUrlTab } from '@/lib/url-state';
import { useProjectReconciliation, useRemoveActivityNorm, useRemoveMaterialNorm } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, formatQty, toNumber } from '@/lib/format';
import { downloadWorkbook, exportFileName, workbookSheet } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { Section, SectionStack } from '@/components/common/Section';
import { PeriodPicker, periodLabel, periodParams, type PeriodState } from '@/components/cost/PeriodPicker';
import { NormFormModal } from './NormFormModal';
import { StandardNormsModal } from './StandardNormsModal';
import { SubconReconciliation } from './SubconReconciliation';
import { WastageReport } from './WastageReport';
import { EstimatePanel } from './EstimatePanel';
import { ExceptionsView, KitsView, PipeView, StructureView } from './StockViews';

const RED = themeColor('colorErrorText');
const STATUS_COLOR: Record<ReconciliationStatus, string> = { OVER: 'error', UNDER: 'warning', WITHIN: 'success', NO_WORK: 'default' };

export const qty = (v: string, unit?: string) => (
  <span className="mono" translate="no">
    {formatQty(v)}
    {unit ? ` ${unit}` : ''}
  </span>
);

export function StatusCell({ status }: { status: ReconciliationStatus }) {
  return (
    <Tooltip title={RECONCILIATION_STATUS_HINTS[status]}>
      <AppTag color={STATUS_COLOR[status]} style={{ margin: 0 }}>
        {RECONCILIATION_STATUS_LABELS[status]}
      </AppTag>
    </Tooltip>
  );
}

export function FrontCell({ qtyValue, unit, flag }: { qtyValue: string | null; unit: string; flag: FrontFlag | null }) {
  if (qtyValue === null) return <span className="text-muted">-</span>;
  return (
    <>
      {qty(qtyValue, unit)}
      {flag ? (
        <div>
          <Tooltip title={FRONT_FLAG_HINTS[flag]}>
            <AppTag color={flag === 'USED_NOT_ISSUED' ? 'error' : 'warning'} style={{ margin: 0 }}>
              {FRONT_FLAG_LABELS[flag]}
            </AppTag>
          </Tooltip>
        </div>
      ) : null}
    </>
  );
}

/** Used per the DPR lines, with what they needed by the norms beneath; red when over the allowance. */
function UsedCell({ r }: { r: ReconciliationItemDto }) {
  if (r.usedStatus === null) return <span className="text-muted">not reported</span>;
  return (
    <Tooltip title={RECONCILIATION_STATUS_HINTS[r.usedStatus]}>
      <span className="mono" translate="no" style={{ color: r.usedStatus === 'OVER' ? RED : undefined }}>
        {formatQty(r.usedQty)} {r.unit}
      </span>
      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        needs {formatQty(r.neededQty)}
        {r.usedVariancePct !== null ? ` (${r.usedVariancePct > 0 ? '+' : ''}${r.usedVariancePct}%)` : ''}
      </div>
    </Tooltip>
  );
}

/** Variance in the item's unit with its % beside it; red when more was used than theoretical. */
function VarianceCell({ r }: { r: ReconciliationItemDto }) {
  const v = toNumber(r.varianceQty);
  return (
    <span className="mono" translate="no" style={{ color: r.status === 'OVER' ? RED : undefined }}>
      {v > 0 ? '+' : ''}
      {formatQty(r.varianceQty)}
      {r.variancePct !== null ? ` (${r.variancePct > 0 ? '+' : ''}${r.variancePct}%)` : ''}
    </span>
  );
}

const VIEWS = ['materials', 'structure', 'pipe', 'kits', 'exceptions', 'subcontractors', 'wastage', 'estimate'] as const;
type View = (typeof VIEWS)[number];

/**
 * A project's material reconciliation (v4, extended in v5 item 92 and item 128): materials against the work and the DPR,
 * per component, per pipe size and per house-connection kit, the day's exceptions, each subcontractor's issues against
 * their measured work, stock written off by reason, and the estimate built from the rate analysis. Pipe and kits are
 * on projects whose type has a pipe network. The open view is `?sub=` in the URL.
 */
export function ReconciliationPanel({ projectId, network = false }: { projectId: string; network?: boolean }) {
  const { user } = useAuth();
  const [view, setView] = useUrlTab<View>(VIEWS, 'materials');
  const cost = !!user && canViewCost(user.roleKey);
  return (
    <AppTabs
      activeKey={view}
      onChange={(k) => setView(k as View)}
      items={[
        { key: 'materials', label: 'Materials', children: <MaterialsView projectId={projectId} /> },
        { key: 'structure', label: 'Structure', children: <StructureView projectId={projectId} /> },
        ...(network
          ? [
              { key: 'pipe', label: 'Pipe', children: <PipeView projectId={projectId} /> },
              { key: 'kits', label: 'Kits', children: <KitsView projectId={projectId} /> },
            ]
          : []),
        { key: 'exceptions', label: 'Needs a look', children: <ExceptionsView projectId={projectId} /> },
        { key: 'subcontractors', label: 'Subcontractors', children: <SubconReconciliation projectId={projectId} /> },
        { key: 'wastage', label: 'Wastage', children: <WastageReport projectId={projectId} /> },
        { key: 'estimate', label: cost ? 'Estimate' : 'Rate analysis', children: <EstimatePanel projectId={projectId} /> },
      ]}
    />
  );
}

/**
 * Materials: approved work × the QS's norms (theoretical) against what the store issued to site less what came back
 * (consumed), item by item, with the norms that drive it.
 */
function MaterialsView({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>({ preset: 'all', range: null });
  const [editing, setEditing] = useState<MaterialNormDto | null>(null);
  const [editingActivity, setEditingActivity] = useState<ActivityNormDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { data, isLoading, error, refetch } = useProjectReconciliation(projectId, periodParams(period));
  const remove = useRemoveMaterialNorm();
  const removeActivity = useRemoveActivityNorm();
  const values = !!data?.canSeeValues;
  const reports = !!data?.frontFrom;

  const openForm = (n: MaterialNormDto | null, a: ActivityNormDto | null = null) => {
    setEditing(n);
    setEditingActivity(a);
    setFormOpen(true);
  };

  const exportExcel = () => {
    if (!data) return;
    const n = (v: string | null) => (v === null ? null : toNumber(v));
    void downloadWorkbook(exportFileName(`material-reconciliation-${data.projectCode}`), [
      workbookSheet<ReconciliationItemDto>(
        'Reconciliation',
        [
          { header: 'Item', value: (r) => r.itemName, width: 28 },
          { header: 'Unit', value: (r) => r.unit },
          { header: 'Opening', value: (r) => n(r.openingQty) },
          { header: 'Received', value: (r) => n(r.receivedQty) },
          { header: 'Book closing', value: (r) => n(r.closingQty) },
          { header: 'Theoretical', value: (r) => n(r.theoreticalQty) },
          { header: 'Allowed', value: (r) => n(r.allowedQty) },
          { header: 'Issued', value: (r) => n(r.issuedQty) },
          { header: 'Returned', value: (r) => n(r.returnedQty) },
          { header: 'Consumed', value: (r) => n(r.consumedQty) },
          { header: 'Variance', value: (r) => n(r.varianceQty) },
          { header: 'Variance %', value: (r) => r.variancePct },
          { header: 'Status', value: (r) => RECONCILIATION_STATUS_LABELS[r.status], width: 18 },
          { header: 'Excess', value: (r) => n(r.excessQty) },
          ...(values ? [{ header: 'Rate', value: (r: ReconciliationItemDto) => n(r.rate) }, { header: 'Excess value', value: (r: ReconciliationItemDto) => n(r.excessValue) }] : []),
          { header: 'Needed by the DPR lines', value: (r) => n(r.neededQty) },
          { header: 'Allowed for the DPR lines', value: (r) => n(r.neededAllowedQty) },
          { header: 'Used per DPR', value: (r) => n(r.usedQty) },
          { header: 'Used − needed', value: (r) => n(r.usedVarianceQty) },
          { header: 'Used − needed %', value: (r) => r.usedVariancePct },
          { header: 'Use status', value: (r) => (r.usedStatus ? RECONCILIATION_STATUS_LABELS[r.usedStatus] : null), width: 18 },
          { header: 'At work front', value: (r) => n(r.atFrontQty) },
          { header: 'Work front', value: (r) => (r.front ? FRONT_FLAG_LABELS[r.front] : null), width: 24 },
        ],
        data.items,
      ),
      workbookSheet<MaterialNormDto>(
        'Norms',
        [
          { header: 'BOQ item', value: (r) => r.boqItemNo },
          { header: 'Description', value: (r) => r.boqDescription, width: 40 },
          { header: 'BOQ unit', value: (r) => r.boqUnit },
          { header: 'Store item', value: (r) => r.itemName, width: 28 },
          { header: 'Item unit', value: (r) => r.itemUnit },
          { header: 'Quantity per unit', value: (r) => toNumber(r.qtyPerUnit) },
          { header: 'Wastage %', value: (r) => toNumber(r.wastagePct) },
          { header: 'Note', value: (r) => r.note, width: 40 },
        ],
        data.norms,
      ),
      workbookSheet<ActivityNormDto>(
        'Activity norms',
        [
          { header: 'Component', value: (r) => r.elementLabel, width: 28 },
          { header: 'Activity', value: (r) => r.activityName, width: 32 },
          { header: 'Activity unit', value: (r) => r.activityUnit },
          { header: 'Store item', value: (r) => r.itemName, width: 28 },
          { header: 'Item unit', value: (r) => r.itemUnit },
          { header: 'Quantity per unit', value: (r) => toNumber(r.qtyPerUnit) },
          { header: 'Wastage %', value: (r) => toNumber(r.wastagePct) },
          { header: 'Note', value: (r) => r.note, width: 40 },
        ],
        data.activityNorms,
      ),
      workbookSheet<UnreconciledItemDto>(
        'Without a norm',
        [
          { header: 'Item', value: (r) => r.itemName, width: 28 },
          { header: 'Unit', value: (r) => r.unit },
          { header: 'Consumed', value: (r) => toNumber(r.consumedQty) },
          { header: 'Used per DPR', value: (r) => toNumber(r.usedQty) },
          { header: 'At work front', value: (r) => n(r.atFrontQty) },
          { header: 'Work front', value: (r) => (r.front ? FRONT_FLAG_LABELS[r.front] : null), width: 24 },
        ],
        data.unreconciled,
      ),
    ]);
  };

  const itemColumns: TableProps<ReconciliationItemDto>['columns'] = [
    { title: 'Item', dataIndex: 'itemName', fixed: 'left', width: 180 },
    { title: 'Theoretical', dataIndex: 'theoreticalQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Allowed', dataIndex: 'allowedQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    {
      title: 'Consumed',
      dataIndex: 'consumedQty',
      width: 130,
      align: 'right',
      render: (v: string, r) => (
        <>
          {qty(v, r.unit)}
          {toNumber(r.returnedQty) > 0 ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {formatQty(r.issuedQty)} issued, {formatQty(r.returnedQty)} back
            </div>
          ) : null}
        </>
      ),
    },
    { title: 'Variance', key: 'variance', width: 140, align: 'right', render: (_, r) => <VarianceCell r={r} /> },
    { title: 'Status', dataIndex: 'status', width: 150, render: (s: ReconciliationStatus) => <StatusCell status={s} /> },
    { title: 'Excess', dataIndex: 'excessQty', width: 110, align: 'right', render: (v: string, r) => (toNumber(v) > 0 ? qty(v, r.unit) : <span className="text-muted">-</span>) },
    { title: 'Used per DPR', key: 'used', width: 150, align: 'right', render: (_, r) => <UsedCell r={r} /> },
    { title: 'At work front', dataIndex: 'atFrontQty', width: 170, align: 'right', render: (v: string | null, r) => <FrontCell qtyValue={v} unit={r.unit} flag={r.front} /> },
    ...(values
      ? [
          {
            title: 'Excess value',
            dataIndex: 'excessValue',
            width: 120,
            align: 'right' as const,
            render: (v: string | null) =>
              v === null ? (
                <Tooltip title="Set a rate on the item in the item master">
                  <span className="text-muted">
                    no rate
                  </span>
                </Tooltip>
              ) : toNumber(v) > 0 ? (
                <span className="mono" translate="no" style={{ color: RED }}>
                  {formatINR(v)}
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
        ]
      : []),
  ];

  const lineColumns = (unit: string): TableProps<ReconciliationLineDto>['columns'] => [
    { title: 'BOQ item', dataIndex: 'itemNo', width: 80, className: 'mono', render: (v: string, l) => (l.activityId ? <Tooltip title="An activity's own norm">{v || '-'}</Tooltip> : v) },
    { title: 'Description', dataIndex: 'description', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Work done', dataIndex: 'executedQty', width: 140, align: 'right', render: (v: string, l) => qty(v, l.unit) },
    { title: 'Norm', dataIndex: 'qtyPerUnit', width: 170, align: 'right', render: (v: string, l) => <span className="mono" translate="no">{`${v} ${unit} / ${l.unit}`}</span> },
    { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v: string) => <span className="mono">{`${v}%`}</span> },
    { title: 'Theoretical', dataIndex: 'theoreticalQty', width: 130, align: 'right', render: (v: string) => qty(v, unit) },
  ];

  const normColumns: TableProps<MaterialNormDto>['columns'] = [
    { title: 'BOQ item', dataIndex: 'boqItemNo', width: 80, className: 'mono' },
    { title: 'Description', dataIndex: 'boqDescription', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Store item', dataIndex: 'itemName', width: 200 },
    { title: 'Per unit', dataIndex: 'qtyPerUnit', width: 170, align: 'right', render: (v: string, r) => <span className="mono" translate="no">{`${v} ${r.itemUnit} / ${r.boqUnit}`}</span> },
    { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v: string) => <span className="mono">{`${v}%`}</span> },
    {
      title: 'Source',
      dataIndex: 'note',
      width: 220,
      ellipsis: { showTitle: false },
      render: (v: string | null, r) => (
        <Tooltip title={`Last set by ${r.updatedByName ?? 'someone'} on ${formatDateTime(r.updatedAt)}`}>
          <span>{v ?? <span className="text-muted">-</span>}</span>
        </Tooltip>
      ),
    },
    ...(data?.canEditNorms
      ? [
          {
            title: '',
            key: 'actions',
            width: 96,
            render: (_: unknown, r: MaterialNormDto) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit the norm for ${r.itemName} on item ${r.boqItemNo}`} onClick={() => openForm(r)} />
                <ConfirmDelete
                  verb="Remove"
                  what={`the norm for ${r.itemName} on item ${r.boqItemNo}`}
                  description="The item's theoretical quantity no longer counts this BOQ item."
                  onConfirm={() => remove.mutateAsync({ projectId, normId: r.id })}
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove the norm for ${r.itemName} on item ${r.boqItemNo}`} />
                </ConfirmDelete>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const activityNormColumns: TableProps<ActivityNormDto>['columns'] = [
    { title: 'Component', dataIndex: 'elementLabel', width: 200, ellipsis: { showTitle: false }, render: (v: string | null) => (v ? <Tooltip title={v}>{v}</Tooltip> : <span className="text-muted">-</span>) },
    { title: 'Activity', dataIndex: 'activityName', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Store item', dataIndex: 'itemName', width: 200 },
    { title: 'Per unit', dataIndex: 'qtyPerUnit', width: 170, align: 'right', render: (v: string, r) => <span className="mono" translate="no">{`${v} ${r.itemUnit} / ${r.activityUnit}`}</span> },
    { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v: string) => <span className="mono">{`${v}%`}</span> },
    ...(data?.canEditNorms
      ? [
          {
            title: '',
            key: 'actions',
            width: 96,
            render: (_: unknown, r: ActivityNormDto) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit the norm for ${r.itemName} on ${r.activityName}`} onClick={() => openForm(null, r)} />
                <ConfirmDelete
                  verb="Remove"
                  what={`the norm for ${r.itemName} on ${r.activityName}`}
                  description="The activity's work no longer needs this item; its BOQ item's norms apply again if it has no other norm."
                  onConfirm={() => removeActivity.mutateAsync({ projectId, normId: r.id })}
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove the norm for ${r.itemName} on ${r.activityName}`} />
                </ConfirmDelete>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!data}>
            Export
          </Button>
          {data?.canEditNorms ? (
            <>
              {/* The standard norms library (finding 16 of the October review): a project need not start from nothing. */}
              <Button onClick={() => setLibraryOpen(true)}>Add standard norms</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
                New norm
              </Button>
            </>
          ) : null}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {!data.norms.length && !data.activityNorms.length ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="No material norms yet"
              description={`A norm says how much of a store item one unit of a BOQ item uses, such as 8.2 bags of cement per cum of M25. With norms set, approved progress gives the theoretical consumption to check issues against.${data.canEditNorms ? ' Add standard norms starts from the usual figures for the work your BOQ names.' : ' The QS, the project manager, management or admin can set them.'}`}
              action={
                data.canEditNorms ? (
                  <Button size="small" onClick={() => setLibraryOpen(true)}>
                    Add standard norms
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="Items reconciled" value={data.items.length} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {periodLabel(period)}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Over allowance" value={data.overCount} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: data.overCount ? RED : undefined } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Below theoretical" value={data.underCount} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                By more than {RECONCILIATION_UNDER_PCT}%
              </div>
            </Col>
            {values ? (
              <Col xs={12} md={6}>
                <Statistic
                  title="Excess value"
                  value={formatINR(data.excessValue)}
                  styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: toNumber(data.excessValue) > 0 ? RED : undefined } }}
                />
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  Used beyond the allowance, at item rates
                </div>
              </Col>
            ) : null}
          </Row>

          <Section style={{ marginTop: 16 }} title="Theoretical against consumed">
            <Table<ReconciliationItemDto>
              rowKey="itemId"
              size="small"
              pagination={false}
              dataSource={data.items}
              scroll={{ x: values ? 1420 : 1300 }}
              columns={itemColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to reconcile: add norms for the materials that go into the work" /> }}
              expandable={{
                expandedRowRender: (r) => <Table<ReconciliationLineDto> rowKey="normId" size="small" pagination={false} dataSource={r.lines} columns={lineColumns(r.unit)} scroll={{ x: 760 }} />,
                rowExpandable: (r) => r.lines.length > 0,
              }}
            />
            {reports ? (
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                Used per DPR is what the approved DPR lines in the period say they used, against what those lines needed by the norms. At the work front is
                what should be on site now: issued less returned from a week before {formatDate(data.frontFrom)}, the first DPR that reported material, less all
                the DPRs say was used since
                {data.notReportedCount || data.usedNotIssuedCount
                  ? `: ${[data.notReportedCount ? `${data.notReportedCount} issued and never reported used` : '', data.usedNotIssuedCount ? `${data.usedNotIssuedCount} used beyond what was issued` : ''].filter(Boolean).join(', ')}`
                  : ''}
                .
              </Typography.Paragraph>
            ) : (
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                No approved DPR in the period says what material it used, so use and the work front cannot be checked yet. The site engineer adds the material on each work line of the DPR.
              </Typography.Paragraph>
            )}
            {data.boqItemsWithoutNorm ? (
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                {data.boqItemsWithoutNorm} BOQ item{data.boqItemsWithoutNorm === 1 ? ' has' : 's have'} work done in the period and no norm. Work such as excavation needs none.
              </Typography.Paragraph>
            ) : null}
          </Section>

          {data.unreconciled.length ? (
            <Section style={{ marginTop: 16 }} title="Without a norm">
              <Table<UnreconciledItemDto>
                rowKey="itemId"
                size="small"
                pagination={false}
                dataSource={data.unreconciled}
                scroll={{ x: 680 }}
                columns={[
                  { title: 'Item', dataIndex: 'itemName' },
                  { title: 'Consumed', dataIndex: 'consumedQty', width: 150, align: 'right', render: (v: string, r) => qty(v, r.unit) },
                  { title: 'Used per DPR', dataIndex: 'usedQty', width: 150, align: 'right', render: (v: string, r) => qty(v, r.unit) },
                  { title: 'At work front', dataIndex: 'atFrontQty', width: 170, align: 'right', render: (v: string | null, r) => <FrontCell qtyValue={v} unit={r.unit} flag={r.front} /> },
                ]}
              />
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                These were used at site but no norm ties them to the work, so they cannot be checked. Consumables such as diesel and shuttering usually stay here.
              </Typography.Paragraph>
            </Section>
          ) : null}

          <Section style={{ marginTop: 16 }} title="Norms" extra={<Typography.Text type="secondary">{data.norms.length}</Typography.Text>}>
            <Table<MaterialNormDto>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={data.norms}
              scroll={{ x: 980 }}
              columns={normColumns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No norms yet" /> }}
            />
          </Section>

          {data.activityNorms.length ? (
            <Section style={{ marginTop: 16 }} title="Norms on activities" extra={<Typography.Text type="secondary">{data.activityNorms.length}</Typography.Text>}>
              <Table<ActivityNormDto> rowKey="id" size="small" pagination={false} dataSource={data.activityNorms} scroll={{ x: 980 }} columns={activityNormColumns} />
              <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                For work with no BOQ item of its own. An activity with norms here counts by them, not by its BOQ item&apos;s.
              </Typography.Paragraph>
            </Section>
          ) : null}

          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
            Theoretical is approved progress on each BOQ item in the period × its norm; allowed adds the norm&apos;s wastage. Consumed is what the store issued to
            this site less what came back from site in the same period; transfers to other projects and returns to the supplier do not count. A row is over its
            allowance when more was consumed than allowed, and below theoretical when it is more than {RECONCILIATION_UNDER_PCT}% under.
          </Typography.Paragraph>
        </>
      )}
      <NormFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} norm={editing} activityNorm={editingActivity} />
      <StandardNormsModal open={libraryOpen} onClose={() => setLibraryOpen(false)} projectId={projectId} />
    </SectionStack>
  );
}
