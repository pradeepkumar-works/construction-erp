'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Empty, Flex, Form, Input, InputNumber, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { BatchColumnMap, BatchField, BatchMaterialColumn, ConnectionHealth, GuessItem, PlantBatchRowDto, PlantControllerDto, RmcOrderDto } from '@erp/shared';
import { BATCH_FIELD_LABELS, BATCH_FIELDS, BATCH_NO_CHALLAN_HOURS, BATCH_REQUIRED, CONNECTION_HEALTH_LABELS, canManageIntegrations, columnMapProblem, defaultPerUnit, guessColumns, readBatchRow } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMixDesigns, usePlantBatches, useRmcAction, useRmcOrders } from '@/lib/queries';
import { formatDateTime, formatQty } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { Section } from '@/components/common/Section';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoreOutlined } from '@/components/common/icons';
import { HEALTH_TONE } from '@/components/integrations/Connections';
import { DispatchForm } from './BatchForms';
import { PlantFilter, m3, usePlantScope } from './rmcUi';
import { useRmcDrawers } from './Drawers';

const small = { fontSize: themeFontSize('fontSizeSM') };
const left = (o: RmcOrderDto) => Math.max(0, Number(o.quantity) - Number(o.delivered) - Number(o.onTheWay));
const materialsText = (r: PlantBatchRowDto) => r.materials.map((m) => `${formatQty(m.actualQty)} ${m.unit} ${m.itemName}`).join(', ');

/**
 * The batching plant controller's batches (item 149): each batch the controller wrote to its report, read by the
 * Connector, waits here for its challan. The plant picks the order (offered by the batch's order column or its mix),
 * and Dispatch makes the challan with the batch's own weights; a trial or wasted batch is set aside with why.
 */
export function Batcher() {
  const { user } = useAuth();
  const [plantId] = usePlantScope();
  const { data, isLoading, error, refetch } = usePlantBatches(plantId);
  const { data: orders } = useRmcOrders({ plantId, status: 'CONFIRMED', pageSize: 100 });
  const { openBatch, drawers } = useRmcDrawers();
  const [orderFor, setOrderFor] = useState<Record<string, string | undefined>>({});
  const [dispatching, setDispatching] = useState<{ row: PlantBatchRowDto; order: RmcOrderDto } | null>(null);
  const [matching, setMatching] = useState<PlantControllerDto | null>(null);
  const [settingAside, setSettingAside] = useState<PlantBatchRowDto | null>(null);
  const open = (orders?.items ?? []).filter((o) => left(o) > 0);

  if (error) return <QueryError error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <PageSkeleton shape="list" header={false} />;
  const admin = !!user && canManageIntegrations(user.roleKey);

  const chosen = (r: PlantBatchRowDto) => {
    const id = r.id in orderFor ? orderFor[r.id] : (r.suggestedOrderId ?? undefined);
    return open.find((o) => o.id === id);
  };

  const batchCell = (r: PlantBatchRowDto) => (
    <div>
      <span className="mono" translate="no">
        {r.batchNo ? `Batch ${r.batchNo}` : 'No batch number'}
      </span>
      <div className="text-muted" style={small} translate="no">
        {r.at ? formatDateTime(r.at) : `Read ${formatDateTime(r.takenAt)}`}
      </div>
    </div>
  );

  const loadCell = (r: PlantBatchRowDto) => (
    <div>
      <span translate="no">{[r.quantity !== null ? m3(r.quantity) : null, r.mix, r.truck].filter(Boolean).join(', ') || '-'}</span>
      {r.materials.length ? (
        <div className="text-muted" style={small} translate="no">
          {materialsText(r)}
        </div>
      ) : null}
    </div>
  );

  const waitingColumns: TableProps<PlantBatchRowDto>['columns'] = [
    {
      title: 'Batch',
      key: 'batch',
      width: 170,
      render: (_, r) => (
        <div>
          {batchCell(r)}
          {r.late ? <AppTag tone="pending">{`No challan after ${BATCH_NO_CHALLAN_HOURS} h`}</AppTag> : null}
        </div>
      ),
    },
    {
      title: 'Load',
      key: 'load',
      render: (_, r) => (
        <div>
          {loadCell(r)}
          {r.problems.length ? (
            <div style={{ ...small, color: themeColor('colorErrorText') }}>{r.problems.join('. ')}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Order',
      key: 'order',
      width: 300,
      render: (_, r) => (
        <Select
          aria-label={`Order for batch ${r.batchNo ?? ''}`}
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          disabled={!data.canDispatch}
          placeholder={open.length ? 'Choose the order' : 'No confirmed order with room'}
          value={chosen(r)?.id}
          onChange={(v) => setOrderFor((s) => ({ ...s, [r.id]: v }))}
          options={open.filter((o) => o.plantId === r.plantId).map((o) => ({ value: o.id, label: `${o.orderNo}, ${o.grade}, ${o.customer}, ${m3(left(o))} left` }))}
          style={{ width: '100%' }}
        />
      ),
    },
    ...(data.canDispatch
      ? [
          {
            title: '',
            key: 'act',
            width: 140,
            render: (_: unknown, r: PlantBatchRowDto) => {
              const order = chosen(r);
              return (
                <Space size={4}>
                  <Button size="small" type="primary" disabled={!order || r.problems.length > 0} onClick={() => order && setDispatching({ row: r, order })} aria-label={`Dispatch batch ${r.batchNo ?? ''}`}>
                    Dispatch
                  </Button>
                  <Dropdown trigger={['click']} menu={{ items: [{ key: 'aside', label: 'Set the batch aside', danger: true }], onClick: () => setSettingAside(r) }}>
                    <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More for batch ${r.batchNo ?? ''}`} />
                  </Dropdown>
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  const doneColumns: TableProps<PlantBatchRowDto>['columns'] = [
    { title: 'Batch', key: 'batch', width: 170, render: (_, r) => batchCell(r) },
    { title: 'Load', key: 'load', render: (_, r) => loadCell(r) },
    {
      title: 'Challan',
      key: 'challan',
      width: 280,
      render: (_, r) =>
        r.rmcBatchId ? (
          <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => openBatch(r.rmcBatchId!)}>
            <span translate="no">{r.rmcBatchNo}</span>
          </Button>
        ) : (
          <span className="text-muted">{`Set aside: ${r.dismissReason ?? ''}`}</span>
        ),
    },
  ];

  const controllerColumns: TableProps<PlantControllerDto>['columns'] = [
    {
      title: 'Controller',
      key: 'name',
      render: (_, c) => (
        <div>
          <span translate="no">{c.name}</span>
          <div className="text-muted" style={small} translate="no">
            {`${c.plantName}, ${c.folder}`}
          </div>
        </div>
      ),
    },
    { title: 'State', key: 'health', width: 170, render: (_, c) => <AppTag tone={HEALTH_TONE[c.health as ConnectionHealth]}>{CONNECTION_HEALTH_LABELS[c.health as ConnectionHealth]}</AppTag> },
    { title: 'Last batch read', key: 'last', width: 170, render: (_, c) => (c.lastEventAt ? formatDateTime(c.lastEventAt) : <span className="text-muted">None yet</span>) },
    {
      title: 'Columns',
      key: 'columns',
      width: 230,
      render: (_, c) => (
        <Space size={4} wrap>
          {c.columns ? <AppTag tone="success">Matched</AppTag> : <AppTag tone="pending">Not matched yet</AppTag>}
          {data.canMatch && c.headers.length ? (
            <Button size="small" type={c.columns ? 'default' : 'primary'} onClick={() => setMatching(c)} aria-label={`Match the columns of ${c.name}`}>
              {c.columns ? 'Change' : 'Match the columns'}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={small}>
          {data.controllers.length
            ? 'Each batch the controller writes to its report comes in within a minute or two, with the materials it weighed.'
            : 'No batching plant controller is connected: make each challan in Trucks and challans, typing the printout’s weights.'}{' '}
          {!data.controllers.length && admin ? (
            <LinkButton size="small" type="link" href="/connections" style={{ paddingInline: 0 }}>
              Connect the controller
            </LinkButton>
          ) : null}
        </Typography.Text>
        <PlantFilter />
      </Flex>
      {data.controllers.length ? (
        <Section title="Controllers">
          <Table<PlantControllerDto> rowKey="connectionId" size="small" pagination={false} dataSource={data.controllers} scroll={{ x: 800 }} columns={controllerColumns} />
        </Section>
      ) : null}
      {data.controllers.length ? (
        <Section style={{ marginTop: 16 }} title="Waiting for a challan">
          <Table<PlantBatchRowDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.waiting}
            scroll={{ x: 1000 }}
            columns={waitingColumns}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every batch made has its challan" /> }}
          />
        </Section>
      ) : null}
      {data.done.length ? (
        <Section style={{ marginTop: 16 }} title="On a challan or set aside, last 7 days">
          <Table<PlantBatchRowDto> rowKey="id" size="small" pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }} dataSource={data.done} scroll={{ x: 900 }} columns={doneColumns} />
        </Section>
      ) : null}
      <DispatchForm order={dispatching?.order ?? null} row={dispatching?.row} onClose={() => setDispatching(null)} />
      <ColumnsForm controller={matching} onClose={() => setMatching(null)} />
      <SetAsideForm row={settingAside} onClose={() => setSettingAside(null)} />
      {drawers}
    </div>
  );
}

interface ColumnValues {
  fields: Partial<Record<BatchField, string>>;
  materials: BatchMaterialColumn[];
}

/** What a material's figure is for one of its item's units: "kg per Bags". */
function PerUnitInput({ name, units }: { name: number; units: Map<string, string> }) {
  const form = Form.useFormInstance<ColumnValues>();
  const itemId = Form.useWatch(['materials', name, 'itemId'], form);
  const unit = itemId ? units.get(itemId) : undefined;
  return (
    <Form.Item name={[name, 'perUnit']} noStyle rules={[{ required: true, message: 'Type how much of the column makes one of the item’s units' }]}>
      <InputNumber aria-label="Column's figure for one unit" min={0} max={100000} suffix={unit ? `per ${unit}` : undefined} style={{ width: '100%' }} />
    </Form.Item>
  );
}

/**
 * The plant's column map, matched once from a real report: which column is the batch number, the cubic metres, the
 * mix and the truck, and which are the materials weighed, each to its item and how much of the column makes one of
 * the item's units. Starts from the map saved, else a guess from the headers; the sample row shows how it reads.
 */
function ColumnsForm({ controller, onClose }: { controller: PlantControllerDto | null; onClose: () => void }) {
  const [form] = Form.useForm<ColumnValues>();
  const { message } = App.useApp();
  const save = useRmcAction<PlantControllerDto>();
  const { data: designs } = useMixDesigns({ plantId: controller?.plantId }, !!controller);
  const items = useMemo<GuessItem[]>(() => {
    const seen = new Map<string, GuessItem>();
    for (const d of designs ?? []) for (const l of d.lines) if (!seen.has(l.itemId)) seen.set(l.itemId, { id: l.itemId, name: l.itemName, unit: l.unit });
    return [...seen.values()];
  }, [designs]);
  const units = useMemo(() => new Map(items.map((i) => [i.id, i.unit])), [items]);
  const headers = controller?.headers ?? [];
  const sample = controller?.sample ?? null;

  useEffect(() => {
    if (!controller || !designs) return;
    const start = controller.columns ?? guessColumns(controller.headers, items);
    form.setFieldsValue({ fields: start.fields, materials: start.materials.map((m) => ({ ...m, perUnit: m.perUnit || (defaultPerUnit(units.get(m.itemId)) ?? (null as unknown as number)) })) });
  }, [controller, designs, items, units, form]);

  const fields = Form.useWatch('fields', form);
  const materials = Form.useWatch('materials', form);
  const map: BatchColumnMap = { fields: fields ?? {}, materials: (materials ?? []).filter((m) => m?.column && m.itemId).map((m) => ({ ...m, perUnit: Number(m.perUnit) || 0 })) };
  const read = sample ? readBatchRow(sample, map) : null;
  const name = (id: string) => items.find((i) => i.id === id);
  const headerOptions = headers.map((h) => ({ value: h, label: sample?.[h] ? `${h} (${sample[h]})` : h }));

  return (
    <FormShell
      // Opened once the plant's items are in, so the map it starts from is what it opened with, not a change.
      open={!!controller && !!designs}
      onClose={onClose}
      form={form}
      layout="modal"
      width={760}
      projectDefault={false}
      title={controller ? `Match the columns of ${controller.name}` : 'Match the columns'}
      okText="Save the columns"
      onSubmit={async (v) => {
        const columns: BatchColumnMap = {
          fields: Object.fromEntries(Object.entries(v.fields ?? {}).filter(([, c]) => !!c)),
          materials: (v.materials ?? []).map((m) => ({ column: m.column, itemId: m.itemId, perUnit: Number(m.perUnit) })),
        };
        const problem = columnMapProblem(columns, headers);
        if (problem) throw new Error(problem);
        await save.mutateAsync({ method: 'put', path: `/rmc/batcher/${controller!.connectionId}/columns`, body: { columns } });
        message.success('Columns saved; the batches waiting are read again with them');
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          {`Choose what each column of the controller's report is. The figure in brackets is from its newest batch.`}
        </Typography.Paragraph>
        <Flex wrap gap={12}>
          {BATCH_FIELDS.map((f) => (
            <Form.Item
              key={f}
              name={['fields', f]}
              label={BATCH_FIELD_LABELS[f]}
              rules={BATCH_REQUIRED.includes(f) ? [{ required: true, message: `Choose the column for ${BATCH_FIELD_LABELS[f].toLowerCase()}` }] : []}
              style={{ flex: '1 1 220px', marginBottom: 12 }}
            >
              <Select allowClear placeholder={BATCH_REQUIRED.includes(f) ? 'Choose the column' : 'Not in the report'} options={headerOptions} />
            </Form.Item>
          ))}
        </Flex>
        <Typography.Text strong>Materials weighed</Typography.Text>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Most controllers print kilograms: 50 makes a bag of cement, about 1,600 a cum of sand, 1 a kg or a litre of admixture.
        </Typography.Paragraph>
        <LineTable
          name="materials"
          label="Material"
          addText="Add material"
          newLine={() => ({ column: undefined, itemId: undefined, perUnit: null })}
          columns={[
            {
              key: 'column',
              title: 'Column',
              width: 230,
              render: (f) => (
                <Form.Item name={[f.name, 'column']} noStyle rules={[{ required: true, message: 'Choose the column' }]}>
                  <Select aria-label="Material column" options={headerOptions} style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
            {
              key: 'item',
              title: 'Item',
              render: (f) => (
                <Form.Item name={[f.name, 'itemId']} noStyle rules={[{ required: true, message: 'Choose the item' }]}>
                  <Select
                    aria-label="Material item"
                    showSearch={{ optionFilterProp: 'label' }}
                    options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
                    onChange={(id: string) => {
                      const per = defaultPerUnit(units.get(id));
                      if (per !== null && !form.getFieldValue(['materials', f.name, 'perUnit'])) form.setFieldValue(['materials', f.name, 'perUnit'], per);
                    }}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              ),
            },
            { key: 'per', title: 'Figure for one unit', width: 190, render: (f) => <PerUnitInput name={f.name} units={units} /> },
          ]}
        />
        {read ? (
          <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
            <Typography.Text strong>The newest batch reads: </Typography.Text>
            {read.problems.length ? (
              <span style={{ color: themeColor('colorErrorText') }}>{read.problems.join('. ')}</span>
            ) : (
              <span translate="no">
                {[`Batch ${read.batchNo}`, read.at ? formatDateTime(read.at.toISOString()) : null, m3(read.quantity), read.mix, read.truck].filter(Boolean).join(', ')}
                {read.materials.length ? `: ${read.materials.map((m) => `${formatQty(m.actualQty)} ${name(m.itemId)?.unit ?? ''} ${name(m.itemId)?.name ?? ''}`).join(', ')}` : ''}
              </span>
            )}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </FormShell>
  );
}

/** A trial batch, a washout or a load that never left: set aside with why, so it is not offered for a challan again. */
function SetAsideForm({ row, onClose }: { row: PlantBatchRowDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ reason: string }>();
  const { message } = App.useApp();
  const save = useRmcAction();
  return (
    <FormShell
      open={!!row}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={row ? `Set aside batch ${row.batchNo ?? ''}` : 'Set aside the batch'}
      okText="Set it aside"
      onSubmit={async (v) => {
        await save.mutateAsync({ path: `/rmc/batcher/rows/${row!.id}/dismiss`, body: { reason: v.reason.trim() } });
        message.success(`Batch ${row!.batchNo ?? ''} set aside; it will not be offered for a challan`);
      }}
    >
      <Form form={form} layout="vertical">
        {row ? (
          <Typography.Paragraph type="secondary">
            <span translate="no">{[row.quantity !== null ? m3(row.quantity) : null, row.mix, row.truck].filter(Boolean).join(', ')}</span>
            {'. It will not be offered for a challan again, and nothing is issued from the store for it.'}
          </Typography.Paragraph>
        ) : null}
        <Form.Item name="reason" label="Why it is set aside" rules={[{ required: true, whitespace: true, message: 'Say why the batch is set aside, such as a trial batch' }]}>
          <Input.TextArea rows={2} maxLength={300} placeholder="Trial batch for the slump check" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
