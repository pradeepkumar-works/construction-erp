'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Alert, App, Button, Flex, Form, Grid, Input, InputNumber, Segmented, Select, Skeleton, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PIPE_MATERIALS,
  PIPE_MATERIAL_LABELS,
  PIPE_NODE_KINDS,
  PIPE_NODE_KIND_LABELS,
  PIPE_SCOPES,
  PIPE_SCOPE_LABELS,
  addPipe,
  chainageLabel,
  moveNode,
  networkChanges,
  networkOf,
  nextNetworkCode,
  pipeRoute,
  reshapePipe,
  routeLengthM,
  splitPipe,
  type EditableNetwork,
  type PipeMaterial,
  type PipeNetworkImportResultDto,
  type PipeNodeDto,
  type PipeNodeKind,
  type PipeSegmentDto,
  type PipeZoneDto,
} from '@erp/shared';
import { tk } from '@/ds';
import { api } from '@/lib/api';
import { formatQty } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import type { EditMode, Picked } from './PipeEditMap';

const PipeEditMap = dynamic(() => import('./PipeEditMap'), { ssr: false, loading: () => <Skeleton.Node active style={{ width: '100%', height: '62vh' }} /> });

/** The short name a new point of each kind takes on site drawings. */
const KIND_PREFIX: Partial<Record<PipeNodeKind, string>> = { SLUICE_VALVE: 'SV-0', AIR_VALVE: 'AV-0', SCOUR: 'WO-0', CHAMBER: 'CH-0', JUNCTION: 'J-0', END: 'END-0', CROSSING_PIT: 'CP-0' };
const SPLIT_KINDS: PipeNodeKind[] = ['SLUICE_VALVE', 'AIR_VALVE', 'SCOUR', 'CHAMBER', 'JUNCTION', 'CROSSING_PIT'];
const DIAMETERS = [63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 300, 315, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200];

const newPointCode = (net: EditableNetwork, kind: PipeNodeKind) => {
  const taken = [...net.nodes.map((n) => n.code), ...net.pipes.map((p) => p.code)];
  const sample = [...net.nodes].reverse().find((n) => n.kind === kind && /^[A-Za-z]+[-_ ]?\d+$/.test(n.code))?.code ?? KIND_PREFIX[kind] ?? 'J-0';
  return nextNetworkCode(taken, sample);
};

interface Values {
  network: EditableNetwork;
}

/**
 * Editing a zone's network on a real map (ARCHITECTURE "Pipe network", Editing on the map): move a valve or a junction,
 * reshape a pipe's route, put a valve on a pipe (cutting it in two) or draw a new pipe, and correct a pipe's size or a
 * point's kind beside the map. It saves through the import, after its preview: matched by code, nothing deleted, and no
 * pipe cut below the work on it.
 */
export function PipeNetworkEditor({
  open,
  onClose,
  projectId,
  zone,
  nodes,
  segments,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  zone: PipeZoneDto;
  nodes: PipeNodeDto[];
  segments: PipeSegmentDto[];
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm<Values>();
  const saved = useMemo(() => networkOf(nodes, segments), [nodes, segments]);
  const network = Form.useWatch('network', form) ?? saved;
  const changes = useMemo(() => networkChanges(saved, network), [saved, network]);
  const edited = changes.added.length + changes.changed.length > 0;

  // What saving would do, from the import's own preview, a moment after each change.
  const preview = useMutation({
    mutationFn: async (net: EditableNetwork) => (await api.post<PipeNetworkImportResultDto>(`/projects/${projectId}/pipe-network/import`, { zoneId: zone.id, nodes: net.nodes, pipes: net.pipes, dryRun: true })).data,
  });
  const { mutate: runPreview, reset: resetPreview } = preview;
  useEffect(() => {
    if (!open || !edited) {
      resetPreview();
      return;
    }
    const t = setTimeout(() => runPreview(network), 500);
    return () => clearTimeout(t);
  }, [open, edited, network, runPreview, resetPreview]);
  const problems = preview.data?.problems ?? [];
  const plan = preview.data?.plan;

  const footer = !edited ? (
    <Typography.Text type="secondary">No changes yet</Typography.Text>
  ) : plan ? (
    <Typography.Text type={problems.length ? 'danger' : 'secondary'}>
      {problems.length
        ? `${problems.length} thing${problems.length === 1 ? '' : 's'} to correct before saving`
        : `Pipes: ${plan.pipes.added} new, ${plan.pipes.changed} changed. Points: ${plan.nodes.added} new, ${plan.nodes.changed} changed.`}
    </Typography.Text>
  ) : (
    <Typography.Text type="secondary">Checking the changes…</Typography.Text>
  );

  return (
    <FormShell<Values>
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1240}
      projectDefault={false}
      title={`Edit network: ${zone.label}`}
      okText="Save network"
      okDisabled={!edited || problems.length > 0 || preview.isPending}
      footerExtra={footer}
      onSubmit={async (v) => {
        const res = (await api.post<PipeNetworkImportResultDto>(`/projects/${projectId}/pipe-network/import`, { zoneId: zone.id, nodes: v.network.nodes, pipes: v.network.pipes })).data;
        if (!res.saved) throw new Error(res.problems.join('. ') || 'The network was not saved. Check the changes and try again.');
        message.success(`Network saved: ${res.plan.pipes.added} pipes added, ${res.plan.pipes.changed} changed, ${res.plan.nodes.added} points added.`);
        await qc.invalidateQueries({ queryKey: ['activities', projectId] });
      }}
    >
      <Form form={form} layout="vertical" initialValues={{ network: saved }}>
        <Form.Item name="network" noStyle>
          <NetworkField saved={saved} problems={problems} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

function NetworkField({ value, onChange, saved, problems }: { value?: EditableNetwork; onChange?: (v: EditableNetwork) => void; saved: EditableNetwork; problems: string[] }) {
  const net = value ?? saved;
  const screens = Grid.useBreakpoint();
  const [history, setHistory] = useState<EditableNetwork[]>([]);
  const [mode, setMode] = useState<EditMode>('select');
  const [picked, setPicked] = useState<Picked>(null);
  const [kind, setKind] = useState<PipeNodeKind>('SLUICE_VALVE');
  const [code, setCode] = useState('');
  const [size, setSize] = useState<{ diameterMm: number; material: PipeMaterial; pipeClass: string | null }>(() => {
    const last = saved.pipes[saved.pipes.length - 1];
    return { diameterMm: last?.diameterMm ?? 110, material: last?.material ?? 'HDPE', pipeClass: last?.pipeClass ?? null };
  });
  const [notice, setNotice] = useState<string | null>(null);

  const change = (next: EditableNetwork) => {
    setHistory((h) => [...h.slice(-49), net]);
    onChange?.(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onChange?.(prev);
  };

  const { added, changed } = useMemo(() => networkChanges(saved, net), [saved, net]);
  const touched = useMemo(() => new Set([...added, ...changed]), [added, changed]);
  const placedCount = net.nodes.filter((n) => typeof n.lat === 'number' && typeof n.lon === 'number').length;
  const suggested = useMemo(() => newPointCode(net, kind), [net, kind]);
  const pointCode = code || suggested;

  const pipe = picked?.kind === 'pipe' ? net.pipes.find((p) => p.code === picked.code) : undefined;
  const node = picked?.kind === 'node' ? net.nodes.find((n) => n.code === picked.code) : undefined;
  const isNew = (c: string) => added.includes(c);

  const setPipe = (patch: Partial<NonNullable<typeof pipe>>) => pipe && change({ ...net, pipes: net.pipes.map((p) => (p === pipe ? { ...p, ...patch } : p)) });
  const setNode = (patch: Partial<NonNullable<typeof node>>) => node && change({ ...net, nodes: net.nodes.map((n) => (n === node ? { ...n, ...patch } : n)) });
  const removeNew = () => {
    if (pipe && isNew(pipe.code)) {
      const pipes = net.pipes.filter((p) => p !== pipe);
      // A new end left with no pipe goes with it.
      const used = new Set(pipes.flatMap((p) => [p.from, p.to]));
      change({ pipes, nodes: net.nodes.filter((n) => !isNew(n.code) || used.has(n.code)) });
    } else if (node && isNew(node.code) && !net.pipes.some((p) => p.from === node.code || p.to === node.code)) change({ ...net, nodes: net.nodes.filter((n) => n !== node) });
    setPicked(null);
  };
  const measured = pipe ? pipeRoute(net, pipe) : null;
  const measuredM = measured ? Math.round(routeLengthM(measured) * 10) / 10 : null;

  const modeHelp: Record<EditMode, string> = {
    select: 'Click a pipe or a point to see it beside the map. Drag a point to move it; drag the white handles of the chosen pipe to reshape its route.',
    valve: `Click a pipe where the ${PIPE_NODE_KIND_LABELS[kind].toLowerCase()} goes: the pipe is cut in two there, its length shared by the ground on each side.`,
    draw: 'Click from a point along the route and click the last point again to finish. An end within 15 m of a point joins it; otherwise a new junction is made there.',
  };

  const map = (
    <PipeEditMap
      network={net}
      picked={picked}
      mode={mode}
      touched={touched}
      label={`Map of the network: ${net.pipes.length} pipes and ${net.nodes.length} points. The list beside it picks any of them by keyboard.`}
      onPick={(p) => {
        setNotice(null);
        setPicked(p);
      }}
      onMoveNode={(c, to) => change(moveNode(net, c, to))}
      onReshape={(c, bends) => change(reshapePipe(net, c, bends))}
      onSplit={(c, at) => {
        const res = splitPipe(net, c, at, { code: pointCode, kind });
        setNotice(res.problem);
        if (res.problem) return;
        change(res.network);
        setCode('');
        setPicked({ kind: 'node', code: pointCode });
      }}
      onDraw={(route) => {
        const next = addPipe(net, route, size);
        if (next === net) return setNotice('Draw the pipe between two different places');
        setNotice(null);
        change(next);
        setPicked({ kind: 'pipe', code: next.pipes[next.pipes.length - 1].code });
        setMode('select');
      }}
    />
  );

  const side = (
    <Flex vertical gap={tk.space[3]}>
      <Form.Item label="Find a pipe or point" htmlFor="net-edit-find" style={{ marginBottom: 0 }}>
        <Select
          id="net-edit-find"
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="P-27, SV-1…"
          value={picked ? `${picked.kind}:${picked.code}` : undefined}
          onChange={(v: string) => setPicked({ kind: v.startsWith('pipe:') ? 'pipe' : 'node', code: v.slice(5) })}
          options={[
            { label: 'Pipes', options: net.pipes.map((p) => ({ value: `pipe:${p.code}`, label: `${p.code}, ${p.from} to ${p.to}` })) },
            { label: 'Points', options: net.nodes.map((n) => ({ value: `node:${n.code}`, label: `${n.code}, ${PIPE_NODE_KIND_LABELS[n.kind].toLowerCase()}` })) },
          ]}
        />
      </Form.Item>
      {pipe ? (
        <>
          <Typography.Text strong translate="no">{`${pipe.code}, ${pipe.from} to ${pipe.to}`}</Typography.Text>
          <Form.Item label="Length" htmlFor="net-edit-length" style={{ marginBottom: 0 }} extra={measuredM !== null ? `On the map: ${formatQty(measuredM)} m` : undefined}>
            <Space.Compact style={{ width: '100%' }}>
              <QuantityInput id="net-edit-length" unit="m" value={pipe.lengthM} onChange={(v) => typeof v === 'number' && v > 0 && setPipe({ lengthM: v })} style={{ width: '100%' }} />
              {measuredM !== null && Math.abs(measuredM - pipe.lengthM) >= 0.1 ? <Button onClick={() => setPipe({ lengthM: measuredM })}>Use the map&apos;s</Button> : null}
            </Space.Compact>
          </Form.Item>
          <Flex gap={tk.space[3]}>
            <Form.Item label="Diameter" htmlFor="net-edit-dia" style={{ marginBottom: 0, flex: 1 }}>
              <InputNumber id="net-edit-dia" min={1} max={5000} precision={0} suffix="mm" value={pipe.diameterMm} onChange={(v) => v && setPipe({ diameterMm: v })} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Material" htmlFor="net-edit-material" style={{ marginBottom: 0, flex: 1 }}>
              <Select id="net-edit-material" value={pipe.material} onChange={(v) => setPipe({ material: v })} options={PIPE_MATERIALS.map((m) => ({ value: m, label: PIPE_MATERIAL_LABELS[m] }))} />
            </Form.Item>
          </Flex>
          <Form.Item label="Class" htmlFor="net-edit-class" style={{ marginBottom: 0 }}>
            <Input id="net-edit-class" maxLength={40} placeholder="PN 6, K7" value={pipe.pipeClass ?? ''} onChange={(e) => setPipe({ pipeClass: e.target.value || null })} />
          </Form.Item>
          <Form.Item label="Surface over it" htmlFor="net-edit-surface" style={{ marginBottom: 0 }}>
            <Input id="net-edit-surface" maxLength={60} placeholder="CC road" value={pipe.surface ?? ''} onChange={(e) => setPipe({ surface: e.target.value || null })} />
          </Form.Item>
          <Form.Item label="Crossing" htmlFor="net-edit-crossing" style={{ marginBottom: 0 }}>
            <Input id="net-edit-crossing" maxLength={80} placeholder="Nala, rail" value={pipe.crossing ?? ''} onChange={(e) => setPipe({ crossing: e.target.value || null })} />
          </Form.Item>
          <Form.Item label="Scope" style={{ marginBottom: 0 }}>
            <Segmented value={pipe.scope} onChange={(v) => setPipe({ scope: v })} options={PIPE_SCOPES.map((s) => ({ value: s, label: PIPE_SCOPE_LABELS[s] }))} />
          </Form.Item>
        </>
      ) : node ? (
        <>
          <Typography.Text strong translate="no">{node.code}</Typography.Text>
          <Form.Item label="Kind" htmlFor="net-edit-kind" style={{ marginBottom: 0 }}>
            <Select id="net-edit-kind" value={node.kind} onChange={(v) => setNode({ kind: v })} options={PIPE_NODE_KINDS.map((k) => ({ value: k, label: PIPE_NODE_KIND_LABELS[k] }))} />
          </Form.Item>
          <Flex gap={tk.space[3]}>
            <Form.Item label="Chainage" htmlFor="net-edit-chainage" style={{ marginBottom: 0, flex: 1 }} extra={node.chainage !== null ? chainageLabel(node.chainage) : undefined}>
              <InputNumber id="net-edit-chainage" min={0} precision={0} suffix="m" value={node.chainage} onChange={(v) => setNode({ chainage: v ?? null })} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Ground level" htmlFor="net-edit-level" style={{ marginBottom: 0, flex: 1 }}>
              <InputNumber id="net-edit-level" precision={2} suffix="m" value={node.groundLevel} onChange={(v) => setNode({ groundLevel: v ?? null })} style={{ width: '100%' }} />
            </Form.Item>
          </Flex>
        </>
      ) : (
        <Typography.Text type="secondary">
          {added.length || changed.length
            ? `${added.length ? `New: ${added.join(', ')}. ` : ''}${changed.length ? `Changed: ${changed.join(', ')}.` : ''}`
            : 'Pick a pipe or a point on the map or in the list to correct it.'}
        </Typography.Text>
      )}
      {(pipe && isNew(pipe.code)) || (node && isNew(node.code) && !net.pipes.some((p) => p.from === node.code || p.to === node.code)) ? (
        <Button onClick={removeNew}>Remove {pipe ? 'this new pipe' : 'this new point'}</Button>
      ) : null}
    </Flex>
  );

  return (
    <Flex vertical gap={tk.space[3]}>
      <Flex wrap gap={tk.space[3]} align="center" justify="space-between">
        <Segmented<EditMode>
          aria-label="What a click on the map does"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setNotice(null);
          }}
          options={[
            { value: 'select', label: 'Select and move' },
            { value: 'valve', label: 'Add a valve on a pipe', disabled: !placedCount },
            { value: 'draw', label: 'Draw a pipe', disabled: !placedCount },
          ]}
        />
        <Button onClick={undo} disabled={!history.length}>
          Undo
        </Button>
      </Flex>
      {mode === 'valve' ? (
        <Flex wrap gap={tk.space[3]}>
          <Form.Item label="Kind" htmlFor="net-edit-new-kind" style={{ marginBottom: 0, minWidth: 180 }}>
            <Select id="net-edit-new-kind" value={kind} onChange={setKind} options={SPLIT_KINDS.map((k) => ({ value: k, label: PIPE_NODE_KIND_LABELS[k] }))} />
          </Form.Item>
          <Form.Item label="Code" htmlFor="net-edit-new-code" style={{ marginBottom: 0, width: 160 }}>
            <Input id="net-edit-new-code" maxLength={40} value={pointCode} onChange={(e) => setCode(e.target.value)} />
          </Form.Item>
        </Flex>
      ) : mode === 'draw' ? (
        <Flex wrap gap={tk.space[3]}>
          <Form.Item label="Diameter" htmlFor="net-edit-new-dia" style={{ marginBottom: 0, minWidth: 140 }}>
            <Select id="net-edit-new-dia" value={size.diameterMm} onChange={(d) => setSize((s) => ({ ...s, diameterMm: d }))} showSearch={{ optionFilterProp: 'label' }} options={DIAMETERS.map((d) => ({ value: d, label: `${d} mm` }))} />
          </Form.Item>
          <Form.Item label="Material" htmlFor="net-edit-new-material" style={{ marginBottom: 0, minWidth: 140 }}>
            <Select id="net-edit-new-material" value={size.material} onChange={(m) => setSize((s) => ({ ...s, material: m }))} options={PIPE_MATERIALS.map((m) => ({ value: m, label: PIPE_MATERIAL_LABELS[m] }))} />
          </Form.Item>
          <Form.Item label="Class" htmlFor="net-edit-new-class" style={{ marginBottom: 0, width: 140 }}>
            <Input id="net-edit-new-class" maxLength={40} value={size.pipeClass ?? ''} onChange={(e) => setSize((s) => ({ ...s, pipeClass: e.target.value || null }))} />
          </Form.Item>
        </Flex>
      ) : null}
      <Typography.Text type="secondary">{modeHelp[mode]}</Typography.Text>
      {!placedCount ? (
        <Alert
          type="info"
          showIcon
          title="This network has no places on the map"
          description="It was loaded from an EPANET file or a sheet without latitudes. Sizes and kinds can still be corrected from the list; import its Google Earth KMZ to edit it on the map."
        />
      ) : null}
      {notice ? <Alert type="warning" showIcon title={notice} /> : null}
      {problems.length ? (
        <Alert
          type="error"
          showIcon
          title="Correct these before saving"
          description={
            <ul style={{ margin: 0, paddingInlineStart: tk.space[5] }}>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          }
        />
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: screens.lg ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)', gap: tk.space[4], alignItems: 'start' }}>
        {map}
        {side}
      </div>
    </Flex>
  );
}
