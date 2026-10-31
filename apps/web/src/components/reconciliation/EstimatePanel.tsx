'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Col, Empty, Form, InputNumber, Row, Segmented, Skeleton, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { CalculatorOutlined, EditOutlined, FileExcelOutlined, UploadOutlined } from '@/components/common/icons';
import type { EstimateItemDto, ProjectEstimateDto } from '@erp/shared';
import { BOQ_RESOURCE_KIND_LABELS } from '@erp/shared';
import { useProjectEstimate, useSetEstimateTerms } from '@/lib/queries';
import { formatINR, formatQty, toNumber, NO_VALUE } from '@/lib/format';
import { downloadWorkbook, exportFileName, workbookSheet } from '@/lib/exportExcel';
import { themeColor, themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MarginText, RateAnalysisDrawer } from './RateAnalysisDrawer';
import { RateAnalysisImportModal } from './RateAnalysisImportModal';

const RED = themeColor('colorErrorText');
const money = (v: string | null) =>
  v === null ? (
    <span className="text-muted">{NO_VALUE}</span>
  ) : (
    <span className="mono" translate="no">
      {formatINR(v, true)}
    </span>
  );

type Show = 'analysed' | 'all';

/**
 * The project's estimate from its rate analysis (v5 item 92): each BOQ item's built-up rate (materials with wastage,
 * labour and machines at today's rates, plus overheads and profit) against the BOQ rate. Without cost it is the list
 * of rate analyses, quantities only. An item opens its rate analysis.
 */
export function EstimatePanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useProjectEstimate(projectId);
  const [show, setShow] = useState<Show>('analysed');
  const [open, setOpen] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [importing, setImporting] = useState(false);
  const values = !!data?.canSeeValues;
  const rows = useMemo(() => (data ? (show === 'all' ? data.items : data.items.filter((i) => i.lines.length)) : []), [data, show]);
  const losing = data?.items.filter((i) => i.margin !== null && toNumber(i.margin) < 0).length ?? 0;

  const exportExcel = () => {
    if (!data) return;
    const n = (v: string | null) => (v === null ? null : toNumber(v));
    const lines = data.items.flatMap((i) => i.lines.map((l) => ({ i, l })));
    void downloadWorkbook(exportFileName(`estimate-${data.projectCode}`), [
      workbookSheet<EstimateItemDto>(
        'Estimate',
        [
          { header: 'BOQ item', value: (r) => r.itemNo },
          { header: 'Description', value: (r) => r.description, width: 48 },
          { header: 'Unit', value: (r) => r.unit },
          { header: 'Quantity', value: (r) => toNumber(r.quantity) },
          ...(values
            ? [
                { header: 'BOQ rate', value: (r: EstimateItemDto) => n(r.boqRate) },
                { header: 'Materials', value: (r: EstimateItemDto) => n(r.material) },
                { header: 'Labour', value: (r: EstimateItemDto) => n(r.labour) },
                { header: 'Machines', value: (r: EstimateItemDto) => n(r.equipment) },
                { header: 'Cost', value: (r: EstimateItemDto) => n(r.cost) },
                { header: `Overheads ${data.overheadPct}%`, value: (r: EstimateItemDto) => n(r.overheads) },
                { header: `Profit ${data.profitPct}%`, value: (r: EstimateItemDto) => n(r.profit) },
                { header: 'Built-up rate', value: (r: EstimateItemDto) => n(r.builtUpRate) },
                { header: 'Margin', value: (r: EstimateItemDto) => n(r.margin) },
                { header: 'Margin %', value: (r: EstimateItemDto) => r.marginPct },
              ]
            : []),
          { header: 'Lines', value: (r) => r.lines.length },
          { header: 'Lines without a rate', value: (r) => r.unpriced },
        ],
        data.items,
      ),
      // Same columns as the import, so the sheet can be changed and imported back
      workbookSheet<(typeof lines)[number]>(
        'Rate analysis',
        [
          { header: 'BOQ item', value: (r) => r.i.itemNo },
          { header: 'Kind', value: (r) => (r.l.kind === 'MATERIAL' ? 'Material' : BOQ_RESOURCE_KIND_LABELS[r.l.kind]) },
          { header: 'Resource', value: (r) => r.l.name, width: 28 },
          { header: 'Unit', value: (r) => r.l.unit },
          { header: 'Per unit', value: (r) => toNumber(r.l.qtyPerUnit) },
          { header: 'Wastage %', value: (r) => (r.l.wastagePct === null ? null : toNumber(r.l.wastagePct)) },
          { header: 'Note', value: (r) => r.l.note, width: 36 },
          ...(values ? [{ header: 'Rate', value: (r: (typeof lines)[number]) => n(r.l.rate) }, { header: 'Per BOQ unit', value: (r: (typeof lines)[number]) => n(r.l.amount) }] : []),
        ],
        lines,
      ),
    ]);
  };

  const opener = (r: EstimateItemDto) => (
    <Button type="link" size="small" className="mono" style={{ padding: 0 }} onClick={() => setOpen(r.boqItemId)} aria-label={`Rate analysis of BOQ item ${r.itemNo}`}>
      {r.itemNo}
    </Button>
  );

  const columns: TableProps<EstimateItemDto>['columns'] = [
    { title: 'BOQ item', dataIndex: 'itemNo', width: 90, fixed: 'left', render: (_, r) => opener(r) },
    { title: 'Description', dataIndex: 'description', ellipsis: { showTitle: false }, render: (v: string) => <Tooltip title={v}>{v}</Tooltip> },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      width: 120,
      align: 'right',
      render: (v: string, r) => (
        <span className="mono" translate="no">
          {formatQty(v)} {r.unit}
        </span>
      ),
    },
    ...(values
      ? [
          { title: 'BOQ rate', dataIndex: 'boqRate', width: 100, align: 'right' as const, render: money },
          { title: 'Materials', dataIndex: 'material', width: 100, align: 'right' as const, render: money },
          { title: 'Labour', dataIndex: 'labour', width: 108, align: 'right' as const, render: money },
          { title: 'Machines', dataIndex: 'equipment', width: 108, align: 'right' as const, render: money },
          {
            title: 'Built-up rate',
            dataIndex: 'builtUpRate',
            width: 115,
            align: 'right' as const,
            render: (v: string | null, r: EstimateItemDto) =>
              v === null ? (
                <span className="text-muted">No analysis</span>
              ) : (
                <>
                  {money(v)}
                  {r.unpriced ? (
                    <div style={{ fontSize: themeFontSize('fontSizeSM'), color: themeColor('colorWarningText') }}>
                      {r.unpriced} without a rate
                    </div>
                  ) : null}
                </>
              ),
          },
          { title: 'Margin', key: 'margin', width: 160, align: 'right' as const, render: (_: unknown, r: EstimateItemDto) => <MarginText item={r} /> },
        ]
      : [
          {
            title: 'Rate analysis',
            key: 'lines',
            width: 220,
            render: (_: unknown, r: EstimateItemDto) => {
              if (!r.lines.length) return <span className="text-muted">None yet</span>;
              const m = r.lines.filter((l) => l.kind === 'MATERIAL').length;
              return `${m} material${m === 1 ? '' : 's'}, ${r.lines.length - m} labour or machine`;
            },
          },
        ]),
  ];

  return (
    <SectionStack gap={0}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Segmented<Show>
          aria-label="BOQ items shown"
          value={show}
          onChange={setShow}
          options={[
            { value: 'analysed', label: 'With rate analysis' },
            { value: 'all', label: 'All BOQ items' },
          ]}
        />
        <Space wrap style={{ marginLeft: 'auto' }}>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!data}>
            Export
          </Button>
          {data?.canEdit ? (
            <Button icon={<UploadOutlined />} onClick={() => setImporting(true)}>
              Import rate analysis
            </Button>
          ) : null}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic title="BOQ items analysed" value={data.analysedCount} suffix={`/ ${data.items.length}`} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
            </Col>
            {values ? (
              <>
                <Col xs={12} md={6}>
                  <Statistic title="BOQ value" value={formatINR(data.boqAmount)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    Of the analysed items
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="At built-up rates" value={formatINR(data.estimateAmount)} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    Overheads {data.overheadPct}%, profit {data.profitPct}%{' '}
                    {data.canEdit ? (
                      <Button type="link" size="small" icon={<EditOutlined />} onClick={() => setTerms(true)} style={{ padding: 0, height: 'auto' }}>
                        Change
                      </Button>
                    ) : null}
                  </div>
                </Col>
                <Col xs={12} md={6}>
                  <Statistic title="Items under cost" value={losing} styles={{ content: { fontSize: themeFontSize('fontSizeXL'), color: losing ? RED : undefined } }} />
                  <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    BOQ rate below the built-up rate
                  </div>
                </Col>
              </>
            ) : null}
          </Row>

          <Section style={{ marginTop: 16 }} title={values ? 'Built-up rates against the BOQ' : 'Rate analysis by BOQ item'}>
            <Table<EstimateItemDto>
              rowKey="boqItemId"
              size="small"
              dataSource={rows}
              pagination={{ pageSize: 50, hideOnSinglePage: true }}
              scroll={{ x: values ? 1086 : 700 }}
              columns={columns}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      show === 'analysed'
                        ? 'No BOQ item has a rate analysis yet. Open one from All BOQ items, or import a sheet.'
                        : 'The project has no BOQ items yet'
                    }
                  />
                ),
              }}
            />
          </Section>

          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 12, marginBottom: 0 }}>
            <CalculatorOutlined /> A BOQ item&apos;s rate analysis is the materials one unit uses (the norms the reconciliation checks), the labour days and the machine
            hours it takes.
            {values
              ? ' Materials are priced at item rates with their wastage, labour at the labour rates in Settings, and machines at the average hire rate of the company’s machines of that category. Overheads and profit are added on the cost.'
              : ''}
          </Typography.Paragraph>
        </>
      )}
      <RateAnalysisDrawer projectId={projectId} boqItemId={open} open={!!open} onClose={() => setOpen(null)} />
      {data?.canEdit ? <RateAnalysisImportModal open={importing} onClose={() => setImporting(false)} projectId={projectId} /> : null}
      {data?.canEdit && values ? <TermsModal open={terms} onClose={() => setTerms(false)} projectId={projectId} data={data} /> : null}
    </SectionStack>
  );
}

function TermsModal({ open, onClose, projectId, data }: { open: boolean; onClose: () => void; projectId: string; data: ProjectEstimateDto }) {
  const [form] = Form.useForm<{ overheadPct: number; profitPct: number }>();
  const { message } = App.useApp();
  const save = useSetEstimateTerms();

  useEffect(() => {
    if (open) form.setFieldsValue({ overheadPct: toNumber(data.overheadPct), profitPct: toNumber(data.profitPct) });
  }, [open, data, form]);

  const pct = (label: string) => [
    { required: true, message: `Enter the ${label}, 0 if none` },
    { type: 'number' as const, min: 0, max: 100, message: 'Enter 0 to 100' },
  ];

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      title="Overheads and profit"
      okText="Save"
      onSubmit={async (v) => {
        await save.mutateAsync({ projectId, overheadPct: String(v.overheadPct), profitPct: String(v.profitPct) });
        message.success('Estimate updated');
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">Added on each item&apos;s cost to give its built-up rate, for this project only.</Typography.Paragraph>
        <FormGrid>
          <Form.Item name="overheadPct" label="Overheads" rules={pct('overheads')}>
            <InputNumber<number> min={0} max={100} precision={2} controls={false} inputMode="decimal" suffix="%" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="profitPct" label="Profit" rules={pct('profit')}>
            <InputNumber<number> min={0} max={100} precision={2} controls={false} inputMode="decimal" suffix="%" style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}
