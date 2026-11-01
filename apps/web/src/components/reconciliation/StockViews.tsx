'use client';

import React, { useState } from 'react';
import { Alert, Button, Col, Empty, Row, Skeleton, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { FileExcelOutlined } from '@/components/common/icons';
import type {
  KitComponentDto,
  KitStatus,
  PipeFlag,
  PipeReconRowDto,
  ReconExceptionDto,
  ReconExceptionKind,
  ReconciliationStatus,
  StructureItemDto,
  StructureLineDto,
} from '@erp/shared';
import { ISSUE_WORK_DAYS, KIT_STATUS_LABELS, PIPE_FLAG_HINTS, PIPE_FLAG_LABELS, RECONCILIATION_STATUS_LABELS, RECON_EXCEPTION_LABELS, USE_ISSUE_DAYS, unitLabel } from '@erp/shared';
import { useKitRecon, usePipeRecon, useReconExceptions, useStructureRecon } from '@/lib/queries';
import { formatDate, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { downloadWorkbook, exportFileName, workbookSheet } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { LinkButton } from '@/components/common/LinkButton';
import { Section, SectionStack } from '@/components/common/Section';
import { PeriodPicker, periodLabel, periodParams, type PeriodState } from '@/components/cost/PeriodPicker';
import { StockEntryDrawer } from '@/components/stock/StockEntryDrawer';
import { StatusCell, qty } from './ReconciliationPanel';

const RED = themeColor('colorErrorText');
const small = { fontSize: themeFontSize('fontSizeSM') };
const statStyle = { content: { fontSize: themeFontSize('fontSizeXL') } };
const metres = (v: number | null) => (v === null ? <span className="text-muted">{NO_VALUE}</span> : qty(String(v), 'm'));
const pct = (v: number | null) => (v === null ? null : `${v > 0 ? '+' : ''}${v}%`);
const n = (v: string | null) => (v === null ? null : toNumber(v));

function Toolbar({ period, onPeriod, onExport, canExport }: { period?: PeriodState; onPeriod?: (p: PeriodState) => void; onExport: () => void; canExport: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      {period && onPeriod ? <PeriodPicker value={period} onChange={onPeriod} /> : null}
      <Space wrap style={{ marginLeft: 'auto' }}>
        <Button icon={<FileExcelOutlined />} onClick={onExport} disabled={!canExport}>
          Export
        </Button>
      </Space>
    </div>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => (
  <Typography.Paragraph type="secondary" style={{ ...small, marginTop: 12, marginBottom: 0 }}>
    {children}
  </Typography.Paragraph>
);

// R2: structure

/**
 * Per component: each normed material's design need, what the DPR lines approved in the period needed and
 * used, what was issued to the component and what should still be there, with the use per unit each activity achieved
 * (bags of cement per m³ against the mix, steel per MT).
 */
export function StructureView({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>({ preset: 'all', range: null });
  const { data, isLoading, error, refetch } = useStructureRecon(projectId, periodParams(period));
  const over = data?.elements.reduce((s, e) => s + e.overCount, 0) ?? 0;

  const exportExcel = () => {
    if (!data) return;
    const rows = data.elements.flatMap((e) => e.items.map((i) => ({ e, i })));
    void downloadWorkbook(exportFileName(`structure-reconciliation-${data.projectCode}`), [
      workbookSheet<(typeof rows)[number]>(
        'By component',
        [
          { header: 'Code', value: (r) => r.e.code },
          { header: 'Component', value: (r) => r.e.label, width: 32 },
          { header: 'Item', value: (r) => r.i.itemName, width: 28 },
          { header: 'Unit', value: (r) => r.i.unit },
          { header: 'Design need', value: (r) => n(r.i.designQty) },
          { header: 'Needed by the DPR lines', value: (r) => n(r.i.neededQty) },
          { header: 'Allowed', value: (r) => n(r.i.allowedQty) },
          { header: 'Used per DPR', value: (r) => n(r.i.usedQty) },
          { header: 'Used − needed %', value: (r) => r.i.variancePct },
          { header: 'Status', value: (r) => (r.i.status === 'NO_WORK' ? 'No DPR work' : RECONCILIATION_STATUS_LABELS[r.i.status]), width: 18 },
          { header: 'Issued to it', value: (r) => n(r.i.issuedQty) },
          { header: 'Still at the structure', value: (r) => n(r.i.atFrontQty) },
        ],
        rows,
      ),
    ]);
  };

  const columns: TableProps<StructureItemDto>['columns'] = [
    { title: 'Item', dataIndex: 'itemName', fixed: 'left', width: 180 },
    { title: 'Design need', dataIndex: 'designQty', width: 130, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Needed', dataIndex: 'neededQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    {
      title: 'Used per DPR',
      dataIndex: 'usedQty',
      width: 140,
      align: 'right',
      render: (v: string, r) => (
        <span className="mono" translate="no" style={{ color: r.status === 'OVER' ? RED : undefined }}>
          {formatQty(v)} {r.unit}
          {r.variancePct !== null ? <div style={small}>{pct(r.variancePct)}</div> : null}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      render: (s: ReconciliationStatus) =>
        s === 'NO_WORK' ? (
          <AppTag style={{ margin: 0 }}>No DPR work</AppTag>
        ) : (
          <StatusCell status={s} />
        ),
    },
    { title: 'Issued to it', dataIndex: 'issuedQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    {
      title: 'Still there',
      dataIndex: 'atFrontQty',
      width: 120,
      align: 'right',
      render: (v: string | null, r) =>
        v === null ? (
          <span className="text-muted">{NO_VALUE}</span>
        ) : (
          <Tooltip title="Issued to the component from a week before the first DPR that reported material, less all its DPR lines used since">
            <span className="mono" translate="no" style={{ color: toNumber(v) < 0 ? RED : undefined }}>
              {formatQty(v)} {r.unit}
            </span>
          </Tooltip>
        ),
    },
  ];
  const lineColumns = (unit: string): TableProps<StructureLineDto>['columns'] => [
    { title: 'Activity', dataIndex: 'activityName', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Placed', dataIndex: 'placedQty', width: 160, align: 'right', render: (v: string, l) => <span className="mono" translate="no">{`${formatQty(v)} of ${formatQty(l.plannedQty)} ${unitLabel(l.unit)}`}</span> },
    { title: 'Norm', dataIndex: 'qtyPerUnit', width: 160, align: 'right', render: (v: string, l) => <span className="mono" translate="no">{`${v} ${unit} / ${l.unit}`}</span> },
    { title: 'Used', dataIndex: 'usedQty', width: 120, align: 'right', render: (v: string) => qty(v, unit) },
    {
      title: 'Achieved',
      dataIndex: 'achievedPerUnit',
      width: 160,
      align: 'right',
      render: (v: string | null, l) =>
        v === null ? (
          <span className="text-muted">{NO_VALUE}</span>
        ) : (
          <span className="mono" translate="no" style={{ color: toNumber(v) > toNumber(l.qtyPerUnit) * (1 + toNumber(l.wastagePct) / 100) ? RED : undefined }}>
            {`${formatQty(v)} ${unitLabel(unit)} / ${l.unit}`}
          </span>
        ),
    },
  ];

  return (
    <SectionStack gap={0}>
      <Toolbar period={period} onPeriod={setPeriod} onExport={exportExcel} canExport={!!data?.elements.length} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Statistic title="Components" value={data.elements.length} styles={statStyle} />
              <div className="text-muted" style={small}>
                {periodLabel(period)}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Materials over the mix" value={over} styles={{ content: { ...statStyle.content, color: over ? RED : undefined } }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Issues to no component" value={data.untiedIssues} styles={statStyle} />
              <div className="text-muted" style={small}>
                Count in Materials only
              </div>
            </Col>
          </Row>
          {!data.elements.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No component has material norms on its activities yet. Set norms in Materials, on the BOQ item or on the activity."
            />
          ) : null}
          {data.elements.map((e) => (
            <Section
              key={e.elementId}
              style={{ marginTop: 8 }}
              title={
                <span>
                  <span className="mono" translate="no">
                    {e.code}
                  </span>{' '}
                  {e.label}
                </span>
              }
              extra={e.overCount ? <AppTag tone="danger">{e.overCount} over</AppTag> : null}
            >
              <Table<StructureItemDto>
                rowKey="itemId"
                size="small"
                pagination={false}
                dataSource={e.items}
                scroll={{ x: 960 }}
                columns={columns}
                expandable={{
                  expandedRowRender: (r) => <Table<StructureLineDto> rowKey="activityId" size="small" pagination={false} dataSource={r.lines} columns={lineColumns(r.unit)} scroll={{ x: 760 }} />,
                  rowExpandable: (r) => r.lines.length > 0,
                }}
              />
            </Section>
          ))}
          <Note>
            Design need is the activities&apos; planned quantity × the norms. Needed is the quantity the DPR lines approved in the period placed × the norms; used is
            what those lines say they used. Issued is what the store issued to the component or its activities in the period, less returns. Still there is what
            should be at the structure now: issued from a week before the first DPR that reported material, less all its lines used since. Open a row for each
            activity&apos;s use per unit against its norm.
          </Note>
        </>
      )}
    </SectionStack>
  );
}

// R3: pipe

function PipeFlags({ flags }: { flags: PipeFlag[] }) {
  if (!flags.length) return <span className="text-muted">{NO_VALUE}</span>;
  return (
    <Space size={4} wrap>
      {flags.map((f) => (
        <Tooltip key={f} title={PIPE_FLAG_HINTS[f]}>
          <AppTag tone="danger" style={{ margin: 0 }}>
            {PIPE_FLAG_LABELS[f]}
          </AppTag>
        </Tooltip>
      ))}
    </Space>
  );
}

function WastageCell({ r }: { r: PipeReconRowDto }) {
  if (r.wastagePct === null) return <span className="text-muted">not reported</span>;
  return (
    <Tooltip title={`${formatQty(r.usedM)} m used on DPR lines that laid ${formatQty(r.laidWithUseM)} m; ${r.allowedWastagePct}% allowed`}>
      <span className="mono" translate="no" style={{ color: r.flags.includes('WASTAGE_ABOVE') ? RED : undefined }}>
        {r.wastagePct}%<span className="text-muted"> of {r.allowedWastagePct}%</span>
      </span>
    </Tooltip>
  );
}

/**
 * Pipe by size, since the start, in metres: over the project (scope, ordered, received, in store, issued,
 * laid, tested, to lay, to buy) and per zone (issued to it, laid, cut wastage on the DPR lines, at site not laid).
 */
export function PipeView({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = usePipeRecon(projectId);
  // Sizes flagged over the project or in any zone, each counted once
  const flagged = data ? new Set([...data.sizes, ...data.zones.flatMap((z) => z.rows)].filter((r) => r.flags.length).map((r) => r.key)).size : 0;

  const exportExcel = () => {
    if (!data) return;
    const zoneRows = data.zones.flatMap((z) => z.rows.map((r) => ({ z, r })));
    void downloadWorkbook(exportFileName(`pipe-reconciliation-${data.projectCode}`), [
      workbookSheet<PipeReconRowDto>(
        'By size',
        [
          { header: 'Size', value: (r) => r.label, width: 18 },
          { header: 'Scope m', value: (r) => r.scopeM },
          { header: 'Ordered m', value: (r) => r.orderedM },
          { header: 'Received m', value: (r) => r.receivedM },
          { header: 'In store m', value: (r) => r.inStoreM },
          { header: 'Issued m', value: (r) => r.issuedM },
          { header: 'Laid m', value: (r) => r.laidM },
          { header: 'Tested m', value: (r) => r.testedM },
          { header: 'Cut wastage %', value: (r) => r.wastagePct },
          { header: 'Allowed %', value: (r) => r.allowedWastagePct },
          { header: 'At site not laid m', value: (r) => r.atSiteM },
          { header: 'To lay m', value: (r) => r.balanceToLayM },
          { header: 'To buy m', value: (r) => r.balanceToBuyM },
          { header: 'Flags', value: (r) => r.flags.map((f) => PIPE_FLAG_LABELS[f]).join(', '), width: 30 },
        ],
        data.sizes,
      ),
      workbookSheet<(typeof zoneRows)[number]>(
        'By zone',
        [
          { header: 'Zone', value: (x) => `${x.z.code} ${x.z.label}`, width: 28 },
          { header: 'Size', value: (x) => x.r.label, width: 18 },
          { header: 'Scope m', value: (x) => x.r.scopeM },
          { header: 'Issued to zone m', value: (x) => x.r.issuedM },
          { header: 'Laid m', value: (x) => x.r.laidM },
          { header: 'Tested m', value: (x) => x.r.testedM },
          { header: 'Cut wastage %', value: (x) => x.r.wastagePct },
          { header: 'At site not laid m', value: (x) => x.r.atSiteM },
          { header: 'To lay m', value: (x) => x.r.balanceToLayM },
          { header: 'Flags', value: (x) => x.r.flags.map((f) => PIPE_FLAG_LABELS[f]).join(', '), width: 30 },
        ],
        zoneRows,
      ),
    ]);
  };

  const sizeColumns: TableProps<PipeReconRowDto>['columns'] = [
    { title: 'Size', dataIndex: 'label', fixed: 'left', width: 130, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Scope', dataIndex: 'scopeM', width: 110, align: 'right', render: metres },
    { title: 'Ordered', dataIndex: 'orderedM', width: 110, align: 'right', render: metres },
    { title: 'Received', dataIndex: 'receivedM', width: 110, align: 'right', render: metres },
    { title: 'In store', dataIndex: 'inStoreM', width: 110, align: 'right', render: metres },
    { title: 'Issued', dataIndex: 'issuedM', width: 110, align: 'right', render: metres },
    { title: 'Laid', dataIndex: 'laidM', width: 110, align: 'right', render: metres },
    { title: 'Cut wastage', key: 'wastage', width: 130, align: 'right', render: (_, r) => <WastageCell r={r} /> },
    { title: 'At site, not laid', dataIndex: 'atSiteM', width: 130, align: 'right', render: metres },
    { title: 'To lay', dataIndex: 'balanceToLayM', width: 110, align: 'right', render: metres },
    { title: 'To buy', dataIndex: 'balanceToBuyM', width: 110, align: 'right', render: metres },
    { title: 'Flags', dataIndex: 'flags', width: 170, render: (f: PipeFlag[]) => <PipeFlags flags={f} /> },
  ];
  const zoneColumns: TableProps<PipeReconRowDto>['columns'] = [
    { title: 'Size', dataIndex: 'label', fixed: 'left', width: 130, render: (v: string) => <span translate="no">{v}</span> },
    { title: 'Scope', dataIndex: 'scopeM', width: 110, align: 'right', render: metres },
    { title: 'Issued to zone', dataIndex: 'issuedM', width: 130, align: 'right', render: metres },
    { title: 'Laid', dataIndex: 'laidM', width: 110, align: 'right', render: metres },
    { title: 'Tested', dataIndex: 'testedM', width: 110, align: 'right', render: metres },
    { title: 'Cut wastage', key: 'wastage', width: 130, align: 'right', render: (_, r) => <WastageCell r={r} /> },
    { title: 'At site, not laid', dataIndex: 'atSiteM', width: 130, align: 'right', render: metres },
    { title: 'To lay', dataIndex: 'balanceToLayM', width: 110, align: 'right', render: metres },
    { title: 'Flags', dataIndex: 'flags', width: 170, render: (f: PipeFlag[]) => <PipeFlags flags={f} /> },
  ];

  return (
    <SectionStack gap={0}>
      <Toolbar onExport={exportExcel} canExport={!!data?.sizes.length} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {data.unconverted.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title={`${data.unconverted.length} pipe item${data.unconverted.length === 1 ? ' is' : 's are'} bought by weight with no weight per metre`}
              description={`${data.unconverted.map((u) => `${u.itemName} (${u.unit})`).join(', ')}. Set kg per metre on the item in the item master to count it here.`}
            />
          ) : null}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Statistic title="Pipe sizes" value={data.sizes.length} styles={statStyle} />
              <div className="text-muted" style={small}>
                Since the start
              </div>
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="Sizes flagged" value={flagged} styles={{ content: { ...statStyle.content, color: flagged ? RED : undefined } }} />
            </Col>
          </Row>
          {!data.sizes.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pipe yet: load a zone's network in Pipe network, or receive pipe items whose names or item master say their size" />
          ) : (
            <Section title="Over the project">
              <Table<PipeReconRowDto> rowKey="key" size="small" pagination={false} dataSource={data.sizes} scroll={{ x: 1460 }} columns={sizeColumns} />
            </Section>
          )}
          {data.zones.map((z) => (
            <Section
              key={z.zoneId}
              style={{ marginTop: 16 }}
              title={
                <span>
                  <span className="mono" translate="no">
                    {z.code}
                  </span>{' '}
                  {z.label}
                </span>
              }
              extra={z.hasIssues ? null : <Typography.Text type="secondary">No issue names this zone</Typography.Text>}
            >
              <Table<PipeReconRowDto> rowKey="key" size="small" pagination={false} dataSource={z.rows} scroll={{ x: 1150 }} columns={zoneColumns} />
            </Section>
          ))}
          <Note>
            Sizes that some network has; service pipe to the houses is in Materials and Kits. Pipe bought by weight is turned into metres by the item&apos;s kg
            per metre. Laid and tested come from the pipe network. Cut wastage is what the DPR
            lines that laid pipe say they used beyond the metres laid; at site, not laid is issued less laid less that wastage. To buy is the scope with the
            allowed wastage less what is already ordered or received.
          </Note>
        </>
      )}
    </SectionStack>
  );
}

// R5: kits

const KIT_COLOR: Record<KitStatus, string> = { SHORT: 'error', OVER: 'warning', OK: 'success' };

/** House-connection kits: connections done × the kit (the activity's norms) against what was issued. */
export function KitsView({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useKitRecon(projectId);

  const exportExcel = () => {
    if (!data) return;
    const rows = data.kits.flatMap((k) => k.components.map((c) => ({ k, c })));
    void downloadWorkbook(exportFileName(`kit-reconciliation-${data.projectCode}`), [
      workbookSheet<(typeof rows)[number]>(
        'Kits',
        [
          { header: 'Activity', value: (r) => `${r.k.elementLabel ? `${r.k.elementLabel} › ` : ''}${r.k.activityName}`, width: 36 },
          { header: 'Done', value: (r) => n(r.k.doneQty) },
          { header: 'Component', value: (r) => r.c.itemName, width: 28 },
          { header: 'Unit', value: (r) => r.c.unit },
          { header: 'Per kit', value: (r) => n(r.c.perKit) },
          { header: 'Needed', value: (r) => n(r.c.neededQty) },
          { header: 'Issued', value: (r) => n(r.c.issuedQty) },
          { header: 'Used per DPR', value: (r) => n(r.c.usedQty) },
          { header: 'Issued − needed', value: (r) => n(r.c.differenceQty) },
          { header: 'Kits short', value: (r) => r.c.kitsShort },
          { header: 'Status', value: (r) => KIT_STATUS_LABELS[r.c.status], width: 20 },
        ],
        rows,
      ),
    ]);
  };

  const columns: TableProps<KitComponentDto>['columns'] = [
    { title: 'Component', dataIndex: 'itemName', fixed: 'left', width: 200 },
    { title: 'Per kit', dataIndex: 'perKit', width: 100, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Needed', dataIndex: 'neededQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Issued', dataIndex: 'issuedQty', width: 120, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    { title: 'Used per DPR', dataIndex: 'usedQty', width: 130, align: 'right', render: (v: string, r) => qty(v, r.unit) },
    {
      title: 'Difference',
      dataIndex: 'differenceQty',
      width: 150,
      align: 'right',
      render: (v: string, r) => (
        <span className="mono" translate="no" style={{ color: r.status === 'SHORT' ? RED : undefined }}>
          {toNumber(v) > 0 ? '+' : ''}
          {formatQty(v)} {r.unit}
          {r.kitsShort ? <div style={small}>{`${r.kitsShort} kit${r.kitsShort === 1 ? '' : 's'} short`}</div> : null}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 170,
      render: (s: KitStatus) => (
        <AppTag color={KIT_COLOR[s]} style={{ margin: 0 }}>
          {KIT_STATUS_LABELS[s]}
        </AppTag>
      ),
    },
  ];

  return (
    <SectionStack gap={0}>
      <Toolbar onExport={exportExcel} canExport={!!data?.kits.length} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {!data.kits.length ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No kit yet. In Materials, add norms on the house connection activity: one saddle, one ferrule, the service pipe in metres and so on per connection."
            />
          ) : null}
          {data.kits.map((k) => (
            <Section
              key={k.activityId}
              style={{ marginTop: 8 }}
              title={`${k.elementLabel ? `${k.elementLabel} › ` : ''}${k.activityName}`}
              extra={
                <Space size={8} wrap>
                  <Typography.Text type="secondary">
                    <span className="mono" translate="no">
                      {formatQty(k.doneQty)} of {formatQty(k.plannedQty)}
                    </span>{' '}
                    {k.unit} done
                  </Typography.Text>
                  {k.kitsShort ? <AppTag tone="danger">{`${k.kitsShort} kit${k.kitsShort === 1 ? '' : 's'} short`}</AppTag> : null}
                </Space>
              }
            >
              <Table<KitComponentDto> rowKey="itemId" size="small" pagination={false} dataSource={k.components} scroll={{ x: 990 }} columns={columns} />
            </Section>
          ))}
          <Note>
            Needed is the connections approved so far × each component per kit. Issued counts issues to the activity, and issues to its component that name no
            activity. Short in whole kits: part of a kit missing is a kit that cannot be fixed.
          </Note>
        </>
      )}
    </SectionStack>
  );
}

// R6: exceptions

const EXCEPTION_COLOR: Record<ReconExceptionKind, string> = { USE_WITHOUT_ISSUE: 'error', ISSUE_WITHOUT_WORK: 'warning', LAID_ABOVE_ISSUED: 'error' };

/** The day-to-day exceptions between stock and the DPR, newest first, each with the DPR or issue to open. */
export function ExceptionsView({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState<PeriodState>({ preset: 'month', range: null });
  const [entryId, setEntryId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useReconExceptions(projectId, periodParams(period));

  const exportExcel = () => {
    if (!data) return;
    void downloadWorkbook(exportFileName(`stock-exceptions-${data.projectCode}`), [
      workbookSheet<ReconExceptionDto>(
        'Exceptions',
        [
          { header: 'Date', value: (r) => r.date },
          { header: 'Exception', value: (r) => RECON_EXCEPTION_LABELS[r.kind], width: 24 },
          { header: 'Where', value: (r) => r.elementLabel, width: 28 },
          { header: 'Item', value: (r) => r.itemName, width: 28 },
          { header: 'Quantity', value: (r) => n(r.qty) },
          { header: 'Unit', value: (r) => r.unit },
          { header: 'Detail', value: (r) => r.text, width: 60 },
        ],
        data.rows,
      ),
    ]);
  };

  const columns: TableProps<ReconExceptionDto>['columns'] = [
    { title: 'Date', dataIndex: 'date', width: 110, render: (v: string) => <span translate="no">{formatDate(v)}</span> },
    {
      title: 'Exception',
      dataIndex: 'kind',
      width: 190,
      render: (k: ReconExceptionKind) => (
        <AppTag color={EXCEPTION_COLOR[k]} style={{ margin: 0 }}>
          {RECON_EXCEPTION_LABELS[k]}
        </AppTag>
      ),
    },
    { title: 'Detail', dataIndex: 'text', render: (v: string) => <span>{v}</span> },
    {
      title: '',
      key: 'open',
      width: 140,
      render: (_, r) =>
        r.dprId ? (
          <LinkButton size="small" href={`/dpr/${r.dprId}`}>
            Open the DPR
          </LinkButton>
        ) : r.entryId ? (
          <Button size="small" onClick={() => setEntryId(r.entryId)}>
            Open {r.entryNo}
          </Button>
        ) : null,
    },
  ];

  return (
    <SectionStack gap={0}>
      <Toolbar period={period} onPeriod={setPeriod} onExport={exportExcel} canExport={!!data?.rows.length} />
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          {!data.tiesIssues ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              title="No issue in the period names a component"
              description="Only pipe can be checked. Choose the component or the activity on each issue slip, and use and issues are checked against each other."
            />
          ) : null}
          <Section
            title="Exceptions"
            extra={
              <Typography.Text type="secondary">
                {formatDate(data.from)} to {formatDate(data.to)}
              </Typography.Text>
            }
          >
            <Table<ReconExceptionDto>
              rowKey="key"
              size="small"
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              dataSource={data.rows}
              scroll={{ x: 820 }}
              columns={columns}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to look at: every use was issued, and every issue was worked on" /> }}
            />
          </Section>
          <Note>
            Used with nothing issued: a DPR line reports a material at a component with nothing of it issued there in the {USE_ISSUE_DAYS} days before. Issued
            with no work: an issue to a component with no approved work there in the {ISSUE_WORK_DAYS} days after (judged once those days have passed). Pipe
            laid above issued: a zone has more pipe of a size in the ground than was issued to it.
          </Note>
        </>
      )}
      <StockEntryDrawer id={entryId} onClose={() => setEntryId(null)} />
    </SectionStack>
  );
}
