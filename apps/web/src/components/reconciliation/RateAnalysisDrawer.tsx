'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Descriptions, Drawer, Dropdown, Empty, Form, Grid, Select, Space, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MenuProps, TableProps } from 'antd';
import { CopyOutlined, DeleteOutlined, DownOutlined, EditOutlined, PlusOutlined } from '@/components/common/icons';
import type { EstimateItemDto, EstimateLineDto, MaterialNormDto } from '@erp/shared';
import { BOQ_RESOURCE_KIND_LABELS, RATE_LIBRARY, suggestRateLibrary } from '@erp/shared';
import { useCopyRateAnalysis, useProjectEstimate, useProjects, useRemoveBoqResource, useRemoveMaterialNorm } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { FormShell } from '@/components/form/FormShell';
import { NormFormModal } from './NormFormModal';
import { ResourceFormModal } from './ResourceFormModal';

const RED = themeColor('colorErrorText');

/** Six-decimal norm with its units: "8.2 Bags / Cum". */
const per = (l: EstimateLineDto, boqUnit: string) => (
  <span className="mono" translate="no">
    {`${l.qtyPerUnit} ${l.unit} / ${boqUnit}`}
  </span>
);

const money = (v: string | null) =>
  v === null ? (
    <Tooltip title="No rate is set for it">
      <span className="text-muted">no rate</span>
    </Tooltip>
  ) : (
    <span className="mono" translate="no">
      {formatINR(v, true)}
    </span>
  );

/** A material line as the norm form takes it. */
const asNorm = (item: EstimateItemDto, l: EstimateLineDto): MaterialNormDto => ({
  id: l.id,
  boqItemId: item.boqItemId,
  boqItemNo: item.itemNo,
  boqDescription: item.description,
  boqUnit: item.unit,
  itemId: l.itemId!,
  itemName: l.name,
  itemUnit: l.unit,
  qtyPerUnit: l.qtyPerUnit,
  wastagePct: l.wastagePct ?? '0',
  note: l.note,
  updatedByName: null,
  updatedAt: '',
});

/** "Margin" with its sign and %, red when the BOQ rate does not cover the built-up rate. */
export function MarginText({ item }: { item: EstimateItemDto }) {
  if (item.margin === null) return <span className="text-muted">-</span>;
  const m = toNumber(item.margin);
  return (
    <span className="mono" translate="no" style={{ color: m < 0 ? RED : undefined }}>
      {m > 0 ? '+' : ''}
      {formatINR(item.margin, true)}
      {item.marginPct !== null ? ` (${item.marginPct > 0 ? '+' : ''}${item.marginPct}%)` : ''}
    </span>
  );
}

/**
 * One BOQ item's rate analysis: the materials it uses (the norms the reconciliation reads), the labour and
 * machine hours it takes, and, for those who see cost, the built-up rate they price to. Filled by hand, from the
 * starter library or from another BOQ item.
 */
export function RateAnalysisDrawer({ projectId, boqItemId, open, onClose }: { projectId: string; boqItemId: string | null; open: boolean; onClose: () => void }) {
  const screens = Grid.useBreakpoint();
  const { message, modal } = App.useApp();
  const { data, error, refetch, isLoading } = useProjectEstimate(projectId, open);
  const item = data?.items.find((i) => i.boqItemId === boqItemId) ?? null;
  const [normForm, setNormForm] = useState<{ norm: MaterialNormDto | null } | null>(null);
  const [resourceForm, setResourceForm] = useState<{ line: EstimateLineDto | null } | null>(null);
  const [copying, setCopying] = useState(false);
  const removeNorm = useRemoveMaterialNorm();
  const removeResource = useRemoveBoqResource();
  const copy = useCopyRateAnalysis();
  const edit = !!data?.canEdit;
  const values = !!data?.canSeeValues;
  const materials = item?.lines.filter((l) => l.kind === 'MATERIAL') ?? [];
  const others = item?.lines.filter((l) => l.kind !== 'MATERIAL') ?? [];
  const suggested = item ? suggestRateLibrary(item.description, item.unit) : null;

  const report = (what: string, r: { added: number; updated: number; skipped: string[] }) => {
    const text = `${what}: ${r.added} added${r.updated ? `, ${r.updated} changed` : ''}`;
    if (!r.skipped.length) return void message.success(text);
    modal.info({
      title: text,
      content: (
        <>
          <Typography.Paragraph>Check these:</Typography.Paragraph>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {r.skipped.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      ),
    });
  };

  const fromLibrary = async (key: string) => {
    const entry = RATE_LIBRARY.find((e) => e.key === key)!;
    const go = async () => report(`${entry.name} from the library`, await copy.mutateAsync({ projectId, boqItemId: item!.boqItemId, libraryKey: key }));
    if (!item?.lines.length) return go();
    modal.confirm({
      title: `Add the library's ${entry.name} to item ${item.itemNo}?`,
      content: 'Its lines are added, the ones the item already has are changed to the library figures, and the rest stay.',
      okText: 'Add from the library',
      onOk: go,
    });
  };

  const startMenu: MenuProps['items'] = [
    ...(suggested ? [{ key: `lib:${suggested.key}`, label: `Suggested: ${suggested.name}` }, { type: 'divider' as const }] : []),
    { key: 'library', label: 'From the library', children: RATE_LIBRARY.map((e) => ({ key: `lib:${e.key}`, label: `${e.name} (per ${e.unit})` })) },
    { key: 'copy', label: 'Copy from another BOQ item…', icon: <CopyOutlined /> },
  ];

  const lineActions = (l: EstimateLineDto) =>
    edit ? (
      <Space size={4}>
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          aria-label={`Edit ${l.name}`}
          onClick={() => (l.kind === 'MATERIAL' ? setNormForm({ norm: asNorm(item!, l) }) : setResourceForm({ line: l }))}
        />
        <ConfirmDelete
          verb="Remove"
          what={`${l.name} from item ${item!.itemNo}`}
          description={l.kind === 'MATERIAL' ? "The reconciliation stops counting this item's work for it." : undefined}
          onConfirm={() => (l.kind === 'MATERIAL' ? removeNorm.mutateAsync({ projectId, normId: l.id }) : removeResource.mutateAsync({ projectId, id: l.id }))}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${l.name}`} />
        </ConfirmDelete>
      </Space>
    ) : null;

  const unit = item?.unit ?? '';
  const materialColumns: TableProps<EstimateLineDto>['columns'] = [
    { title: 'Store item', dataIndex: 'name' },
    { title: 'Per unit', key: 'per', width: 170, align: 'right', render: (_, l) => per(l, unit) },
    { title: 'Wastage', dataIndex: 'wastagePct', width: 90, align: 'right', render: (v: string) => <span className="mono">{`${v}%`}</span> },
    ...(values
      ? [
          { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right' as const, render: (v: string | null) => money(v) },
          { title: `Per ${unit}`, dataIndex: 'amount', width: 110, align: 'right' as const, render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : money(v)) },
        ]
      : []),
    ...(edit ? [{ title: '', key: 'actions', width: 84, render: (_: unknown, l: EstimateLineDto) => lineActions(l) }] : []),
  ];
  const otherColumns: TableProps<EstimateLineDto>['columns'] = [
    { title: 'Kind', dataIndex: 'kind', width: 90, render: (k: 'LABOUR' | 'EQUIPMENT') => <AppTag style={{ margin: 0 }}>{BOQ_RESOURCE_KIND_LABELS[k]}</AppTag> },
    {
      title: 'Trade or machine',
      dataIndex: 'name',
      render: (v: string, l) => (
        <>
          {v}
          {l.note ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {l.note}
            </div>
          ) : null}
        </>
      ),
    },
    { title: 'Per unit', key: 'per', width: 170, align: 'right', render: (_, l) => per(l, unit) },
    ...(values
      ? [
          { title: 'Rate', dataIndex: 'rate', width: 110, align: 'right' as const, render: (v: string | null) => money(v) },
          { title: `Per ${unit}`, dataIndex: 'amount', width: 110, align: 'right' as const, render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : money(v)) },
        ]
      : []),
    ...(edit ? [{ title: '', key: 'actions', width: 84, render: (_: unknown, l: EstimateLineDto) => lineActions(l) }] : []),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={screens.md ? 880 : '100%'}
      destroyOnHidden
      title={item ? `Rate analysis · ${item.itemNo}` : 'Rate analysis'}
      extra={
        item && edit ? (
          <Dropdown
            menu={{
              items: startMenu,
              onClick: ({ key }) => (key === 'copy' ? setCopying(true) : key.startsWith('lib:') ? void fromLibrary(key.slice(4)) : undefined),
            }}
          >
            <Button>
              Fill from <DownOutlined />
            </Button>
          </Dropdown>
        ) : null
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading ? <Typography.Text type="secondary">Loading…</Typography.Text> : null}
      {data && !item ? <Empty description="This BOQ item is no longer in the project" /> : null}
      {item ? (
        <SectionStack>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {item.description}{' '}
            <span className="text-muted">
              (<span translate="no">{formatQty(item.quantity)}</span> {item.unit})
            </span>
          </Typography.Paragraph>
          {values ? (
            <Descriptions
              size="small"
              column={{ xs: 1, sm: 2, md: 3 }}
              items={[
                { key: 'boq', label: 'BOQ rate', children: money(item.boqRate) },
                { key: 'built', label: 'Built-up rate', children: item.builtUpRate === null ? <span className="text-muted">No analysis yet</span> : money(item.builtUpRate) },
                { key: 'margin', label: 'Margin', children: <MarginText item={item} /> },
              ]}
            />
          ) : null}

          <Section
            title="Materials"
            extra={
              edit ? (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setNormForm({ norm: null })}>
                  Add material
                </Button>
              ) : null
            }
          >
            <Table<EstimateLineDto>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={materials}
              columns={materialColumns}
              scroll={{ x: 640 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No materials: the reconciliation cannot check this item's work" /> }}
            />
          </Section>

          <Section
            title="Labour and machines"
            extra={
              edit ? (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setResourceForm({ line: null })}>
                  Add labour or a machine
                </Button>
              ) : null
            }
          >
            <Table<EstimateLineDto>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={others}
              columns={otherColumns}
              scroll={{ x: 640 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No labour or machine hours yet" /> }}
            />
          </Section>

          {values && item.builtUpRate !== null ? (
            <Section title={`Built-up rate per ${item.unit}`}>
              <Descriptions
                size="small"
                column={1}
                bordered
                items={[
                  { key: 'm', label: 'Materials, with wastage', children: money(item.material) },
                  { key: 'l', label: 'Labour', children: money(item.labour) },
                  { key: 'e', label: 'Machines', children: money(item.equipment) },
                  { key: 'c', label: 'Cost', children: money(item.cost) },
                  { key: 'o', label: `Overheads (${data!.overheadPct}%)`, children: money(item.overheads) },
                  { key: 'p', label: `Profit (${data!.profitPct}%)`, children: money(item.profit) },
                  { key: 'b', label: <strong>Built-up rate</strong>, children: <strong>{money(item.builtUpRate)}</strong> },
                ]}
              />
              {item.unpriced ? (
                <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: 8, marginBottom: 0 }}>
                  {item.unpriced} line{item.unpriced === 1 ? ' has' : 's have'} no rate and count as nothing: set item rates in the item master, labour rates in Settings, or a rate on a
                  machine of that category.
                </Typography.Paragraph>
              ) : null}
            </Section>
          ) : null}
        </SectionStack>
      ) : null}

      {item ? (
        <>
          <NormFormModal open={!!normForm} onClose={() => setNormForm(null)} projectId={projectId} norm={normForm?.norm ?? null} boqItemId={item.boqItemId} />
          <ResourceFormModal
            open={!!resourceForm}
            onClose={() => setResourceForm(null)}
            projectId={projectId}
            boqItem={item}
            line={resourceForm?.line ?? null}
            kind="LABOUR"
            labourCategories={data?.labourCategories ?? []}
            equipmentCategories={data?.equipmentCategories ?? []}
          />
          <CopyModal open={copying} onClose={() => setCopying(false)} projectId={projectId} target={item} onDone={(r, from) => report(`Copied from ${from}`, r)} />
        </>
      ) : null}
    </Drawer>
  );
}

interface CopyValues {
  sourceProjectId: string;
  fromBoqItemId?: string;
  replace?: boolean;
}

/** Copy another BOQ item's rate analysis, from this project or another one the user can open. */
function CopyModal({
  open,
  onClose,
  projectId,
  target,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  target: EstimateItemDto;
  onDone: (r: { added: number; updated: number; skipped: string[] }, from: string) => void;
}) {
  const [form] = Form.useForm<CopyValues>();
  const copy = useCopyRateAnalysis();
  const { data: projects } = useProjects();
  const source = Form.useWatch('sourceProjectId', form) ?? projectId;
  const { data: est } = useProjectEstimate(source, open);
  const options = useMemo(
    () =>
      (est?.items ?? [])
        .filter((i) => i.lines.length && i.boqItemId !== target.boqItemId)
        .map((i) => ({ value: i.boqItemId, label: `${i.itemNo} · ${i.description} (${i.unit}, ${i.lines.length} line${i.lines.length === 1 ? '' : 's'})` })),
    [est, target.boqItemId],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ sourceProjectId: projectId, replace: false });
  }, [open, projectId, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={`Copy a rate analysis to item ${target.itemNo}`}
      okText="Copy"
      projectDefault={false}
      onSubmit={async (v) => {
        const from = options.find((o) => o.value === v.fromBoqItemId)?.label.split(' · ')[0] ?? 'another item';
        const r = await copy.mutateAsync({ projectId, boqItemId: target.boqItemId, fromBoqItemId: v.fromBoqItemId, replace: !!v.replace });
        onDone(r, source === projectId ? from : `${est?.projectCode ?? 'another project'} ${from}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="sourceProjectId" label="From project">
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
            onChange={() => form.setFieldValue('fromBoqItemId', undefined)}
          />
        </Form.Item>
        <Form.Item name="fromBoqItemId" label="BOQ item" rules={[{ required: true, message: 'Choose the BOQ item to copy from' }]} extra="Only items with a rate analysis are listed.">
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Type an item number or description" options={options} notFoundContent="No item there has a rate analysis yet" />
        </Form.Item>
        <Form.Item name="replace" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>Remove what item {target.itemNo} has first</Checkbox>
        </Form.Item>
      </Form>
    </FormShell>
  );
}
