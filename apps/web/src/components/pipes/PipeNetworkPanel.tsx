'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Flex, Form, Input, InputNumber, Segmented, Select, Space, Statistic, Table, Typography } from 'antd';
import { EditOutlined, UploadOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PIPE_MATERIALS,
  PIPE_MATERIAL_LABELS,
  PIPE_SCOPES,
  PIPE_SCOPE_LABELS,
  PIPE_STAGE_LABELS,
  SEGMENT_STAGES,
  VALVE_NODE_KINDS,
  type PipeMaterial,
  type PipeScope,
  type PipeSegmentDto,
  type ProjectDetail,
  type ZoneTableRow,
} from '@erp/shared';
import { api } from '@/lib/api';
import { usePipeNetwork } from '@/lib/queries';
import { formatPct, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { LinkButton } from '@/components/common/LinkButton';
import { Section } from '@/components/common/Section';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { PipeImportModal } from './PipeImportModal';
import { PipeMap, SEGMENT_STATE_LABELS, segmentState, type SegmentState } from './PipeMap';

type StateFilter = 'all' | SegmentState;

const figure = { content: { fontSize: themeFontSize('fontSizeXL') } };

/**
 * Pipe network tab (item 126, ARCHITECTURE "Pipe network"): a water supply or sewerage project's zones and mains, each
 * drawn from its model file, with every pipe junction to junction in the state of its work, the zone's pipe sheet by
 * diameter, the pipes ready to start, and the list of pipes. Work reaches a pipe only through DPR lines.
 */
export function PipeNetworkPanel({ project }: { project: ProjectDetail }) {
  const { data, isLoading, error, refetch } = usePipeNetwork(project.id);
  const [picked, setPicked] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<PipeSegmentDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<StateFilter>('all');
  const [q, setQ] = useState('');

  const zone = data?.zones.find((z) => z.id === picked) ?? data?.zones.find((z) => z.pipes > 0) ?? data?.zones[0] ?? null;
  const nodes = useMemo(() => (data && zone ? data.nodes.filter((n) => n.zoneId === zone.id) : []), [data, zone]);
  const segments = useMemo(() => (data && zone ? data.segments.filter((s) => s.zoneId === zone.id) : []), [data, zone]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return segments.filter((s) => (filter === 'all' || segmentState(s) === filter) && (!words || `${s.code} ${s.fromCode} ${s.toCode}`.toLowerCase().includes(words)));
  }, [segments, filter, q]);

  if (isLoading) return <PageSkeleton shape="list" header={false} />;
  if (error || !data) return <QueryError error={error} onRetry={refetch} />;

  if (!data.zones.length)
    return (
      <div style={{ padding: 24 }}>
        <p>
          No pipe zones yet. Add a component of kind Pipe network zone, Rising main or Feeder main in Structure, then load its network here from the design
          office&apos;s EPANET or Excel file.
        </p>
        <LinkButton href={`/projects/${project.id}?tab=structure`}>Open Structure</LinkButton>
      </div>
    );

  const total = zone!.table.total;
  const valves = nodes.filter((n) => VALVE_NODE_KINDS.includes(n.kind));
  const unplaced = SEGMENT_STAGES.filter((s) => zone!.unplacedM[s]).map((s) => `${formatQty(zone!.unplacedM[s])} m ${PIPE_STAGE_LABELS[s].toLowerCase()}`);
  const laidPct = total.scopeM ? (100 * total.laidM) / total.scopeM : 0;

  const exportPipes = async () => {
    await downloadXlsx(exportFileName(`pipes-${project.code}-${zone!.code}`), 'Pipes', [
      { header: 'Pipe', value: (s: PipeSegmentDto) => s.code },
      { header: 'From', value: (s) => s.fromCode },
      { header: 'To', value: (s) => s.toCode },
      { header: 'Length m', value: (s) => Number(s.lengthM) },
      { header: 'Diameter mm', value: (s) => s.diameterMm },
      { header: 'Material', value: (s) => PIPE_MATERIAL_LABELS[s.material] },
      { header: 'Class', value: (s) => s.pipeClass ?? '' },
      { header: 'Scope', value: (s) => PIPE_SCOPE_LABELS[s.scope] },
      ...SEGMENT_STAGES.map((st) => ({ header: `${PIPE_STAGE_LABELS[st]} m`, value: (s: PipeSegmentDto) => s.status.done[st] })),
      { header: 'Progress %', value: (s) => s.status.pct },
    ], segments);
    return segments.length;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        {data.zones.length > 1 ? (
          <Select
            aria-label="Zone or main"
            value={zone!.id}
            onChange={(v) => {
              setPicked(v);
              setSelected(null);
            }}
            style={{ minWidth: 260, maxWidth: '100%' }}
            options={data.zones.map((z) => ({ value: z.id, label: `${z.label}${z.pipes ? ` · ${z.pipes} pipes` : ''}` }))}
          />
        ) : (
          <Typography.Text strong translate="no">
            {zone!.label}
          </Typography.Text>
        )}
        <Space wrap>
          {segments.length ? <ExportButton onExport={exportPipes} /> : null}
          {data.canEdit ? (
            <Button icon={<UploadOutlined />} type={segments.length ? 'default' : 'primary'} onClick={() => setImportOpen(true)}>
              Import network
            </Button>
          ) : null}
        </Space>
      </Flex>

      {unplaced.length ? (
        <Alert
          type="info"
          showIcon
          title={`Recorded before the network was loaded: ${unplaced.join(', ')}`}
          description="It counts in the zone's progress, but sits on no pipe. New DPR lines name the pipe."
        />
      ) : null}

      {!segments.length ? (
        <div style={{ padding: '8px 0 24px' }}>
          <p>
            No network loaded for this zone. Import the EPANET (.inp) file from WaterGEMS, LOOP or EPANET, or an Excel sheet of nodes and pipes. Each pipe then
            takes its own trenching, laying, testing and restoration from the DPR, junction to junction.
          </p>
          {data.canEdit ? (
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setImportOpen(true)}>
              Import network
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Space size={32} wrap>
            <Statistic title="Proposed length" value={formatQty(total.scopeM)} suffix="m" styles={figure} />
            <Statistic title="Laid" value={formatPct(laidPct)} styles={figure} />
            <Statistic title="Balance to lay" value={formatQty(total.balanceM)} suffix="m" styles={figure} />
            <Statistic title="Tested" value={formatQty(total.testedM)} suffix="m" styles={figure} />
            {valves.length ? <Statistic title="Valves fixed" value={`${valves.filter((v) => v.fixed).length} of ${valves.length}`} styles={figure} /> : null}
          </Space>

          <PipeMap
            nodes={nodes}
            segments={segments}
            selected={selected}
            label={`Map of ${zone!.label}: ${segments.length} pipes, ${formatQty(total.laidM)} of ${formatQty(total.scopeM)} m laid. The pipe list below gives each pipe.`}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16 }}>
            <Section title="By diameter">
              <Table<ZoneTableRow>
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={zone!.table.rows}
                scroll={{ x: 560 }}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}>
                      <strong>Total</strong>
                    </Table.Summary.Cell>
                    {[total.scopeM, total.trenchedM, total.laidM, total.testedM, total.balanceM].map((v, i) => (
                      <Table.Summary.Cell key={i} index={i + 1} align="right">
                        <strong translate="no">{formatQty(v)}</strong>
                      </Table.Summary.Cell>
                    ))}
                  </Table.Summary.Row>
                )}
                columns={[
                  { key: 'dia', title: 'Pipe', render: (_, r) => <span translate="no">{`${r.diameterMm} mm ${PIPE_MATERIAL_LABELS[r.material]}`}</span> },
                  { key: 'scope', title: 'Scope, m', align: 'right', render: (_, r) => <span translate="no">{formatQty(r.scopeM)}</span> },
                  { key: 'trenched', title: 'Trenched', align: 'right', render: (_, r) => <span translate="no">{formatQty(r.trenchedM)}</span> },
                  { key: 'laid', title: 'Laid', align: 'right', render: (_, r) => <span translate="no">{formatQty(r.laidM)}</span> },
                  { key: 'tested', title: 'Tested', align: 'right', render: (_, r) => <span translate="no">{formatQty(r.testedM)}</span> },
                  { key: 'balance', title: 'Balance', align: 'right', render: (_, r) => <span translate="no">{formatQty(r.balanceM)}</span> },
                ]}
              />
            </Section>
            <Section title="Ready to start">
              {zone!.fronts.length ? (
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                  {zone!.fronts.slice(0, 12).map((f) => (
                    <li key={f.segmentId} translate="no">
                      {f.code} from {f.fromCode}
                      {f.viaCode ? `, where ${f.viaCode} is laid` : ', at the tank'}
                    </li>
                  ))}
                  {zone!.fronts.length > 12 ? <li>and {zone!.fronts.length - 12} more</li> : null}
                </ul>
              ) : (
                <p className="text-muted" style={{ margin: 0 }}>
                  {total.balanceM > 0 ? 'No pipe can start yet: none reaches the tank or a laid pipe.' : 'Every pipe is laid.'}
                </p>
              )}
            </Section>
          </div>

          <Section
            title="Pipes"
            extra={
              <Space wrap>
                <Input.Search allowClear placeholder="Pipe or junction" aria-label="Find a pipe or junction" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
                <Select<StateFilter>
                  aria-label="Show pipes"
                  value={filter}
                  onChange={setFilter}
                  style={{ width: 170 }}
                  options={[{ value: 'all', label: 'All pipes' }, ...(Object.keys(SEGMENT_STATE_LABELS) as SegmentState[]).map((k) => ({ value: k, label: SEGMENT_STATE_LABELS[k] }))]}
                />
              </Space>
            }
          >
            <Table<PipeSegmentDto>
              size="small"
              rowKey="id"
              dataSource={shown}
              pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 860 }}
              rowClassName={(s) => (s.id === selected ? 'ant-table-row-selected' : '')}
              columns={[
                {
                  key: 'code',
                  title: 'Pipe',
                  width: 170,
                  render: (_, s) => (
                    <Button type="link" size="small" style={{ paddingInline: 0 }} aria-pressed={s.id === selected} onClick={() => setSelected(s.id === selected ? null : s.id)}>
                      <span translate="no">{`${s.code}, ${s.fromCode} to ${s.toCode}`}</span>
                    </Button>
                  ),
                },
                { key: 'size', title: 'Size', width: 180, render: (_, s) => <span translate="no" style={{ whiteSpace: 'nowrap' }}>{`${s.diameterMm} mm ${PIPE_MATERIAL_LABELS[s.material]}${s.pipeClass ? ` ${s.pipeClass}` : ''}`}</span> },
                { key: 'length', title: 'Length', align: 'right', width: 90, render: (_, s) => <span translate="no">{`${formatQty(s.lengthM)} m`}</span> },
                {
                  key: 'state',
                  title: 'Work',
                  render: (_, s) => {
                    if (s.scope === 'EXISTING') return 'Existing line';
                    const len = Number(s.lengthM);
                    const part = SEGMENT_STAGES.filter((st) => s.status.done[st] > 0 && s.status.done[st] < len - 0.001).map((st) => `${PIPE_STAGE_LABELS[st].toLowerCase()} ${formatQty(s.status.done[st])} m`);
                    const waiting = SEGMENT_STAGES.filter((st) => s.waiting[st]).map((st) => `${formatQty(s.waiting[st])} m ${PIPE_STAGE_LABELS[st].toLowerCase()}`);
                    return (
                      <>
                        <div>{[s.status.furthest ? PIPE_STAGE_LABELS[s.status.furthest] : s.status.started ? 'Started' : 'Not started', ...part].join(', ')}</div>
                        {waiting.length ? <Typography.Text type="secondary">Waiting for approval: {waiting.join(', ')}</Typography.Text> : null}
                      </>
                    );
                  },
                },
                { key: 'pct', title: 'Done', align: 'right', width: 70, render: (_, s) => <span translate="no">{s.scope === 'EXISTING' ? '-' : formatPct(s.status.pct)}</span> },
                ...(data.canEdit
                  ? [
                      {
                        key: 'actions',
                        title: '',
                        width: 56,
                        render: (_: unknown, s: PipeSegmentDto) => <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Correct ${s.code}`} onClick={() => setEditing(s)} />,
                      },
                    ]
                  : []),
              ]}
            />
          </Section>
        </>
      )}
      {data.canEdit ? <PipeImportModal key={importOpen ? `open-${zone!.id}` : 'closed'} open={importOpen} onClose={() => setImportOpen(false)} projectId={project.id} zones={data.zones} zoneId={zone!.id} /> : null}
      {data.canEdit ? <SegmentFormModal projectId={project.id} segment={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

interface SegmentValues {
  lengthM: number;
  diameterMm: number;
  material: PipeMaterial;
  pipeClass?: string;
  scope: PipeScope;
  surface?: string;
  crossing?: string;
}

/** Corrects one pipe as found on site: its length (never below the work on it), size, class and scope. */
function SegmentFormModal({ projectId, segment, onClose }: { projectId: string; segment: PipeSegmentDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form] = Form.useForm<SegmentValues>();
  const save = useMutation({
    mutationFn: async (v: SegmentValues) =>
      (await api.patch(`/projects/${projectId}/pipe-network/segments/${segment!.id}`, { ...v, pipeClass: v.pipeClass ?? null, surface: v.surface ?? null, crossing: v.crossing ?? null })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['activities', projectId] }),
  });
  return (
    <FormShell<SegmentValues>
      open={!!segment}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title={segment ? `Correct ${segment.code}, ${segment.fromCode} to ${segment.toCode}` : 'Correct pipe'}
      okText="Save pipe"
      onSubmit={(v) => save.mutateAsync(v)}
    >
      {segment ? (
        <Form
          form={form}
          layout="vertical"
          key={segment.id}
          initialValues={{
            lengthM: Number(segment.lengthM),
            diameterMm: segment.diameterMm,
            material: segment.material,
            pipeClass: segment.pipeClass ?? undefined,
            scope: segment.scope,
            surface: segment.surface ?? undefined,
            crossing: segment.crossing ?? undefined,
          }}
        >
          <FormGrid>
            <Form.Item name="lengthM" label="Length" rules={[{ required: true, message: 'Enter the length of the pipe' }, { type: 'number', min: 0.001, message: 'The length must be more than 0' }]}>
              <QuantityInput unit="m" />
            </Form.Item>
            <Form.Item name="diameterMm" label="Diameter" rules={[{ required: true, message: 'Enter the diameter in mm' }]}>
              <InputNumber min={1} max={5000} precision={0} suffix="mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="material" label="Material" rules={[{ required: true, message: 'Choose the material' }]}>
              <Select options={PIPE_MATERIALS.map((m) => ({ value: m, label: PIPE_MATERIAL_LABELS[m] }))} />
            </Form.Item>
            <Form.Item name="pipeClass" label="Class">
              <Input placeholder="PN 6, K7" maxLength={40} />
            </Form.Item>
            <Form.Item name="surface" label="Surface over it">
              <Input placeholder="CC road" maxLength={60} />
            </Form.Item>
            <Form.Item name="crossing" label="Crossing">
              <Input placeholder="Nala, rail" maxLength={80} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="scope" label="Scope">
            <Segmented options={PIPE_SCOPES.map((s) => ({ value: s, label: PIPE_SCOPE_LABELS[s] }))} />
          </Form.Item>
        </Form>
      ) : null}
    </FormShell>
  );
}
