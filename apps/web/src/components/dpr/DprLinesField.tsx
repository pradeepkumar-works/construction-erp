'use client';

import React, { useMemo, useState } from 'react';
import { AutoComplete, Button, Flex, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { FormInstance, FormListFieldData } from 'antd';
import {
  DPR_LINE_PART_LABELS,
  OUTSIDE_BREAKDOWN,
  PICK_OUTSIDE,
  PICK_WHOLE,
  PIPE_NODE_KIND_LABELS,
  PIPE_STAGE_LABELS,
  activitiesFor,
  comparePipeCodes,
  componentChoices,
  componentLabel,
  crewCheck,
  dprActivityLabel,
  dprLineShows,
  filledExtra,
  formatChainage,
  linePick,
  ownFieldsOf,
  parseChainage,
  segmentLabel,
  subComponentChoices,
  suggestMaterials,
  type AttachmentDto,
  type DprActivityOptionDto,
  type DprFormDef,
  type DprLineDto,
  type DprLineInput,
  type DprWorkOptionsDto,
  type MachineryLine,
  type ManpowerLine,
} from '@erp/shared';
import { formatQty } from '@/lib/format';
import { FormGrid } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { QuantityInput } from '@/components/form/inputs';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { typedLocation } from '@/components/sector/SectorInputs';
import { OwnFieldItems, extraBody } from './OwnFields';

/** A work line as the form holds it. */
export interface DprLineValues {
  id: string;
  activityId?: string;
  quantity?: number | null;
  location?: string;
  /** Where by the project's places (item 134): chainage typed as km+m, floor, village */
  chainageFrom?: string;
  chainageTo?: string;
  floor?: string;
  village?: string;
  /** The component and sub-component picked before the activity (the form's cascade); not sent */
  pickComponent?: string | null;
  pickSub?: string | null;
  /** The pipe segment (item 126), or for a valve line the valve, the work was on */
  pipeSegmentId?: string | null;
  pipeNodeId?: string | null;
  labour?: ManpowerLine[];
  machines?: MachineryLine[];
  materials?: { itemId?: string; quantity?: number | null }[];
  workOrderId?: string | null;
  remarks?: string;
  /** The line's fields of the company's own, by key */
  extra?: Record<string, unknown>;
  /** The line's photos; left undefined, the saved ones stay */
  photos?: AttachmentDto[];
  /** The planner changed the material by hand, so the norms no longer fill it */
  materialsEdited?: boolean;
}

export const newLine = (over: Partial<DprLineValues> = {}): DprLineValues => ({ id: crypto.randomUUID(), labour: [], machines: [], materials: [], ...over });

/** A saved line, back into the form (editing a DPR). */
export const lineValues = (l: DprLineDto): DprLineValues => ({
  id: l.id,
  activityId: l.activityId,
  quantity: Number(l.quantity),
  location: typedLocation(l),
  chainageFrom: l.chainageFrom !== null ? formatChainage(l.chainageFrom) : undefined,
  chainageTo: l.chainageTo !== null && l.chainageTo !== l.chainageFrom ? formatChainage(l.chainageTo) : undefined,
  floor: l.floor ?? undefined,
  village: l.village ?? undefined,
  pipeSegmentId: l.pipeSegmentId,
  pipeNodeId: l.pipeNodeId,
  labour: l.labour.map((m) => ({ ...m })),
  machines: l.machines.map((m) => ({ ...m })),
  materials: l.materials.map((m) => ({ itemId: m.itemId, quantity: Number(m.quantity) })),
  workOrderId: l.workOrderId,
  remarks: l.remarks ?? undefined,
  extra: { ...l.extra },
  photos: l.attachments,
  materialsEdited: true,
});

/** Yesterday's lines as a start for today: the same work and crew, today's quantities and material to fill. */
export const copiedLine = (l: DprLineDto): DprLineValues =>
  newLine({
    activityId: l.activityId,
    location: typedLocation(l),
    floor: l.floor ?? undefined,
    village: l.village ?? undefined,
    pipeSegmentId: l.pipeSegmentId,
    labour: l.labour.map((m) => ({ ...m })),
    machines: l.machines.map((m) => ({ ...m })),
    workOrderId: l.workOrderId,
  });

/** The lines as the API takes them. */
export const linesBody = (lines: DprLineValues[] | undefined): DprLineInput[] =>
  (lines ?? [])
    .filter((l) => l && l.activityId)
    .map((l) => ({
      id: l.id,
      activityId: l.activityId!,
      quantity: String(l.quantity ?? ''),
      location: l.location?.trim() || null,
      chainageFrom: parseChainage(l.chainageFrom) ?? null,
      chainageTo: parseChainage(l.chainageTo) ?? null,
      floor: l.floor?.trim() || null,
      village: l.village?.trim() || null,
      pipeSegmentId: l.pipeSegmentId || null,
      pipeNodeId: l.pipeNodeId || null,
      labour: (l.labour ?? []).filter((m) => m && m.category && Number(m.count) > 0).map((m) => ({ category: m.category, count: Math.round(Number(m.count)) })),
      machines: (l.machines ?? []).filter((m) => m && m.name?.trim()).map((m) => ({ name: m.name.trim(), hours: Number(m.hours) || 0 })),
      materials: (l.materials ?? []).filter((m) => m && m.itemId && Number(m.quantity) > 0).map((m) => ({ itemId: m.itemId!, quantity: String(m.quantity) })),
      workOrderId: l.workOrderId || null,
      remarks: l.remarks?.trim() || null,
      extra: extraBody(l.extra),
      ...(l.photos ? { attachmentIds: l.photos.map((p) => p.id) } : {}),
    }));

/**
 * Keeps each line's material filled from its activity's norms as the activity and quantity change, until the
 * planner changes the material by hand, and lets go of a pipe segment or valve that is not in the new activity's zone.
 * Call from the form's `onValuesChange`.
 */
export function followNorms(form: FormInstance, changed: Record<string, unknown>, options: DprWorkOptionsDto | undefined) {
  const touched = changed.lines as (Partial<DprLineValues> | undefined)[] | undefined;
  if (!Array.isArray(touched) || !options) return;
  const lines = (form.getFieldValue('lines') ?? []) as DprLineValues[];
  touched.forEach((t, i) => {
    if (!t || !lines[i]) return;
    if ('materials' in t) {
      form.setFieldValue(['lines', i, 'materialsEdited'], true);
      return;
    }
    const activity = options.activities.find((a) => a.id === lines[i].activityId);
    if ('activityId' in t) {
      const seg = options.segments.find((s) => s.id === lines[i].pipeSegmentId);
      if (seg && (seg.zoneId !== activity?.zoneId || !activity?.pipeStage || activity.pipeStage === 'VALVES')) form.setFieldValue(['lines', i, 'pipeSegmentId'], null);
      const valve = options.valves.find((v) => v.id === lines[i].pipeNodeId);
      if (lines[i].pipeNodeId && (!valve || valve.zoneId !== activity?.zoneId || activity?.pipeStage !== 'VALVES')) form.setFieldValue(['lines', i, 'pipeNodeId'], null);
    }
    if (!('activityId' in t || 'quantity' in t) || lines[i].materialsEdited) return;
    const norms = activity?.norms ?? [];
    form.setFieldValue(['lines', i, 'materials'], suggestMaterials(lines[i].quantity ?? 0, norms).map((m) => ({ itemId: m.itemId, quantity: Number(m.quantity) })));
  });
}

const crewText = (l: DprLineValues | undefined, items: Map<string, { name: string; unit: string }>, def: DprFormDef) =>
  [
    (l?.labour ?? []).filter((m) => m?.category && m.count).map((m) => `${m.category} ${m.count}`).join(', '),
    (l?.machines ?? []).filter((m) => m?.name).map((m) => `${m.name} ${m.hours ?? 0} h`).join(', '),
    (l?.materials ?? [])
      .filter((m) => m?.itemId && m.quantity)
      .map((m) => `${items.get(m.itemId!)?.name ?? 'Item'} ${formatQty(m.quantity ?? 0)} ${items.get(m.itemId!)?.unit ?? ''}`.trim())
      .join(', '),
    filledExtra(ownFieldsOf(def, 'LINE'), extraBody(l?.extra))
      .map((x) => `${x.field.label} ${x.text}`)
      .join(', '),
    l?.photos?.length ? `${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The DPR's work done, line by line (item 127), as the project type's form asks (item 134 part 2): each line against an
 * activity or sub-activity (picked component by component, or from one grouped list), where by the project's places,
 * how much today, and in a dialog per line what else the form takes (crew, machines, material, work order, remark,
 * photo and the company's own line fields). The activities planned this week come first.
 */
export function DprLinesField({ options, headCount, def }: { options: DprWorkOptionsDto | undefined; headCount: ManpowerLine[] | undefined; def: DprFormDef }) {
  const form = Form.useFormInstance();
  const lines = (Form.useWatch('lines', { form, preserve: true }) ?? []) as DprLineValues[];
  const byId = useMemo(() => new Map((options?.activities ?? []).map((a) => [a.id, a])), [options]);
  const items = useMemo(() => new Map((options?.items ?? []).map((i) => [i.id, i])), [options]);
  const activityOptions = useMemo(() => groupedOptions(options?.activities ?? []), [options]);
  const components = useMemo(() => componentChoices(options?.activities ?? []), [options]);
  const cascade = def.lines.picker === 'CASCADE' && components.length > 0;
  const check = crewCheck(lines.filter(Boolean).map((l) => ({ labour: l.labour })), headCount);
  const ownLine = ownFieldsOf(def, 'LINE');
  const parts = def.lines.parts.filter((p) => p !== 'workOrder' || (options?.workOrders.length ?? 0) > 0);
  const details = parts.length > 0 || ownLine.length > 0;
  const detailTitle = [...parts.map((p) => DPR_LINE_PART_LABELS[p]), ...(ownLine.length ? ['more'] : [])].join(', ');

  return (
    <LineTable
      name="lines"
      label="Work"
      addText="Add work line"
      newLine={() => ({ ...newLine() })}
      columns={[
        {
          key: 'activity',
          title: cascade ? 'Component, activity' : 'Activity',
          width: cascade ? 340 : 300,
          render: (f) => {
            const line = lines[f.name];
            const a = byId.get(line?.activityId ?? '');
            return (
              <>
                {cascade ? <CascadePick field={f} line={line} activity={a} options={options!} components={components} /> : null}
                <Form.Item name={[f.name, 'activityId']} noStyle rules={[{ required: true, message: 'Choose the activity' }]}>
                  <Select
                    showSearch={{ optionFilterProp: 'search' }}
                    placeholder="Choose the activity"
                    aria-label={`Activity of work line ${f.name + 1}`}
                    options={cascade ? cascadeOptions(options!, line) : activityOptions}
                    style={{ width: '100%', ...(cascade ? { marginTop: 4 } : {}) }}
                    popupMatchSelectWidth={420}
                  />
                </Form.Item>
                {a ? (
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
                    {cascade ? null : (
                      <>
                        <span translate="no">{componentLabel(a)}</span> ·{' '}
                      </>
                    )}
                    <span translate="no">{`${formatQty(a.doneQty)} of ${formatQty(a.plannedQty)} ${a.unit}`}</span> done
                    {a.holdPoint ? (
                      <AppTag tone="pending" style={{ marginInlineStart: 6 }}>
                        Hold point
                      </AppTag>
                    ) : null}
                  </Typography.Text>
                ) : null}
              </>
            );
          },
        },
        {
          key: 'location',
          title: 'Where',
          width: 220,
          render: (f) => <WhereField field={f} activity={byId.get(lines[f.name]?.activityId ?? '')} options={options} />,
        },
        {
          key: 'quantity',
          title: 'Today',
          width: 150,
          render: (f) => (
            <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity done today' }, { type: 'number', min: 0.001, message: 'The quantity must be more than 0' }]}>
              <QuantityInput unit={byId.get(lines[f.name]?.activityId ?? '')?.unit} aria-label={`Quantity done today on work line ${f.name + 1}`} />
            </Form.Item>
          ),
        },
        ...(details
          ? [
              {
                key: 'details',
                title: detailTitle,
                width: 230,
                render: (f: FormListFieldData) => (
                  <LineDetails field={f} line={lines[f.name]} activity={byId.get(lines[f.name]?.activityId ?? '')} options={options} def={def} summary={crewText(lines[f.name], items, def)} />
                ),
              },
            ]
          : []),
      ]}
      footer={() =>
        lines.length && dprLineShows(def, 'crew') ? (
          <tr>
            <td colSpan={6}>
              <Typography.Text type="secondary">
                {check.headCount === null
                  ? `${check.onLines} people on the work lines`
                  : check.difference === 0
                    ? `All ${check.headCount} on site are on a work line`
                    : check.difference! > 0
                      ? `${check.onLines} of the ${check.headCount} on site are on a work line; ${check.difference} on none`
                      : `The work lines name ${check.onLines} people, ${-check.difference!} more than the ${check.headCount} on site`}
              </Typography.Text>
            </td>
          </tr>
        ) : null
      }
    />
  );
}

/** The component, then the sub-component, before the activity (item 134 part 2). Picking an activity sets both. */
function CascadePick({
  field: f,
  line,
  activity,
  options,
  components,
}: {
  field: FormListFieldData;
  line: DprLineValues | undefined;
  activity: DprActivityOptionDto | undefined;
  options: DprWorkOptionsDto;
  components: ReturnType<typeof componentChoices>;
}) {
  const form = Form.useFormInstance();
  const picked = linePick({ component: line?.pickComponent ?? null, sub: line?.pickSub ?? null }, activity);
  const subs = subComponentChoices(options.activities, picked.component);
  const n = f.name + 1;
  const name = (c: { key: string; name: string | null }, whole: string) => (c.key === PICK_OUTSIDE ? OUTSIDE_BREAKDOWN : c.key === PICK_WHOLE ? whole : `${c.key} ${c.name ?? ''}`.trim());
  const set = (component: string | null, sub: string | null) => {
    form.setFieldValue(['lines', f.name, 'pickComponent'], component);
    form.setFieldValue(['lines', f.name, 'pickSub'], sub);
    const a = form.getFieldValue(['lines', f.name, 'activityId']) as string | undefined;
    const still = activitiesFor(options.activities, component, sub).some((x) => x.id === a);
    if (a && !still) form.setFieldValue(['lines', f.name, 'activityId'], undefined);
  };
  return (
    <Flex gap={4}>
      <Select
        allowClear
        aria-label={`Component of work line ${n}`}
        placeholder="Component"
        value={picked.component ?? undefined}
        onChange={(v?: string) => set(v ?? null, null)}
        options={components.map((c) => ({ value: c.key, label: name(c, '') }))}
        style={{ flex: 1, minWidth: 0 }}
        popupMatchSelectWidth={280}
      />
      {subs.length ? (
        <Select
          allowClear
          aria-label={`Sub-component of work line ${n}`}
          placeholder="Sub-component"
          value={picked.sub ?? undefined}
          onChange={(v?: string) => set(picked.component, v ?? null)}
          options={subs.map((c) => ({ value: c.key, label: name(c, 'The component itself') }))}
          style={{ flex: 1, minWidth: 0 }}
          popupMatchSelectWidth={280}
        />
      ) : null}
    </Flex>
  );
}

/** The activities left by the component and sub-component picked, this week's first. */
function cascadeOptions(options: DprWorkOptionsDto, line: DprLineValues | undefined) {
  const activity = options.activities.find((a) => a.id === line?.activityId);
  const picked = linePick({ component: line?.pickComponent ?? null, sub: line?.pickSub ?? null }, activity);
  const list = activitiesFor(options.activities, picked.component, picked.component === null ? null : picked.sub);
  const option = (a: DprActivityOptionDto) => ({ value: a.id, label: dprActivityLabel(a), search: `${componentLabel(a)} ${dprActivityLabel(a)}` });
  const week = list.filter((a) => a.lookAhead);
  const rest = list.filter((a) => !a.lookAhead);
  return [
    { label: 'Planned this week', options: week.map(option) },
    { label: week.length ? 'Other activities' : 'Activities', options: rest.map(option) },
  ].filter((g) => g.options.length);
}

/** Activities for the line's picker: this week's first, then by component › sub-component. */
/**
 * Where the line's work was. Pipe work (item 126) names the segment from the zone's network, junction to junction, or
 * the valve for a valve line; the server writes the segment into the location and holds each stage to the pipe's length.
 * Anything else, or a zone with no network loaded, is free text.
 */
function WhereField({ field: f, activity: a, options }: { field: FormListFieldData; activity: DprActivityOptionDto | undefined; options: DprWorkOptionsDto | undefined }) {
  const form = Form.useFormInstance();
  const stage = a?.pipeStage ?? null;
  const zoneId = a?.zoneId ?? null;
  const segments = useMemo(
    () => (stage && stage !== 'VALVES' && zoneId ? (options?.segments ?? []).filter((s) => s.zoneId === zoneId).sort((x, y) => comparePipeCodes(x.code, y.code)) : []),
    [options, stage, zoneId],
  );
  const valves = useMemo(() => (stage === 'VALVES' && zoneId ? (options?.valves ?? []).filter((v) => v.zoneId === zoneId).sort((x, y) => comparePipeCodes(x.code, y.code)) : []), [options, stage, zoneId]);
  const n = f.name + 1;
  const sector = options?.sector;
  const places = sector?.locations ?? [];
  const pipe = segments.length > 0 || valves.length > 0;
  const placed = !pipe && places.length > 0;
  const note = (
    <Form.Item name={[f.name, 'location']} noStyle>
      <Input
        placeholder={pipe ? 'Chainage or note' : placed ? 'Note (optional)' : 'Lift 4, P-27 J-12 to J-13'}
        aria-label={placed ? `Note on where work line ${n} was done` : `Where work line ${n} was done`}
        style={pipe || placed ? { marginTop: 4 } : undefined}
      />
    </Form.Item>
  );
  const pick = (list: string[], key: 'floor' | 'village', label: string) => (
    <Form.Item name={[f.name, key]} noStyle>
      {list.length ? (
        <Select allowClear showSearch placeholder={label} aria-label={`${label} of work line ${n}`} options={list.map((x) => ({ value: x, label: x }))} style={{ width: '100%', minWidth: 0 }} />
      ) : (
        <AutoComplete allowClear placeholder={label} aria-label={`${label} of work line ${n}`} style={{ width: '100%', minWidth: 0 }} />
      )}
    </Form.Item>
  );
  const chainageRule = { validator: (_: unknown, v?: string) => (!v || parseChainage(v) !== null ? Promise.resolve() : Promise.reject(new Error('Give the chainage like 14+200'))) };
  // Where by the project's places (item 134): a chainage from and to, a floor, a village; a note below.
  const byPlace = placed ? (
    <Flex vertical gap={4}>
      {places.includes('CHAINAGE') ? (
        <Flex gap={4}>
          <Form.Item name={[f.name, 'chainageFrom']} noStyle rules={[chainageRule]}>
            <Input placeholder={sector?.chainageStart !== null && sector?.chainageStart !== undefined ? formatChainage(sector.chainageStart) : 'From'} aria-label={`Chainage from, work line ${n}`} translate="no" />
          </Form.Item>
          <Form.Item name={[f.name, 'chainageTo']} noStyle rules={[chainageRule]}>
            <Input placeholder="To" aria-label={`Chainage to, work line ${n}`} translate="no" />
          </Form.Item>
        </Flex>
      ) : null}
      {places.includes('FLOOR') ? pick(sector?.floors ?? [], 'floor', 'Floor') : null}
      {places.includes('VILLAGE') ? pick(sector?.villages ?? [], 'village', 'Village') : null}
    </Flex>
  ) : null;
  if (segments.length && stage !== 'VALVES') {
    const verb = PIPE_STAGE_LABELS[stage!].toLowerCase();
    return (
      <>
        <Form.Item name={[f.name, 'pipeSegmentId']} noStyle rules={[{ required: true, message: 'Choose the pipe segment the work was on' }]}>
          <Select
            showSearch={{ optionFilterProp: 'search' }}
            placeholder="Pipe segment"
            aria-label={`Pipe segment of work line ${n}`}
            style={{ width: '100%' }}
            popupMatchSelectWidth={360}
            onChange={() => form.setFieldValue(['lines', f.name, 'pipeNodeId'], null)}
            optionRender={(o) => (
              <>
                <div translate="no">{o.label}</div>
                <Typography.Text type="secondary" translate="no">
                  {o.data.detail}
                </Typography.Text>
              </>
            )}
            options={segments.map((s) => {
              const held = s.held[stage!] ?? 0;
              const len = Number(s.lengthM);
              return {
                value: s.id,
                search: `${s.code} ${s.fromCode} ${s.toCode}`,
                disabled: held >= len - 0.001,
                label: segmentLabel(s),
                detail: `${s.diameterMm} mm · ${formatQty(held)} of ${formatQty(s.lengthM)} m ${verb}`,
              };
            })}
          />
        </Form.Item>
        {note}
      </>
    );
  }
  if (valves.length) {
    return (
      <>
        <Form.Item name={[f.name, 'pipeNodeId']} noStyle>
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'search' }}
            placeholder="Valve (optional)"
            aria-label={`Valve of work line ${n}`}
            style={{ width: '100%' }}
            options={valves.map((v) => ({ value: v.id, search: v.code, label: `${v.code} · ${PIPE_NODE_KIND_LABELS[v.kind]}${v.fixed ? ' · fixed' : ''}` }))}
          />
        </Form.Item>
        {note}
      </>
    );
  }
  return byPlace ? (
    <>
      {byPlace}
      {note}
    </>
  ) : (
    note
  );
}

function groupedOptions(activities: DprActivityOptionDto[]) {
  const option = (a: DprActivityOptionDto) => ({ value: a.id, label: dprActivityLabel(a), search: `${componentLabel(a)} ${dprActivityLabel(a)}` });
  const week = activities.filter((a) => a.lookAhead);
  const groups = new Map<string, DprActivityOptionDto[]>();
  for (const a of activities.filter((x) => !x.lookAhead)) groups.set(componentLabel(a), [...(groups.get(componentLabel(a)) ?? []), a]);
  const rest = [...groups].sort(([x], [y]) => Number(x === OUTSIDE_BREAKDOWN) - Number(y === OUTSIDE_BREAKDOWN));
  return [
    ...(week.length ? [{ label: 'Planned this week', options: week.map(option) }] : []),
    ...rest.map(([label, list]) => ({ label, options: list.map(option) })),
  ];
}

/** One line's crew, machines, material, work order and remark, in a dialog. */
function LineDetails({
  field,
  line,
  activity,
  options,
  def,
  summary,
}: {
  field: FormListFieldData;
  line: DprLineValues | undefined;
  activity: DprActivityOptionDto | undefined;
  options: DprWorkOptionsDto | undefined;
  def: DprFormDef;
  summary: string;
}) {
  const [open, setOpen] = useState(false);
  const form = Form.useFormInstance();
  const n = field.name + 1;
  const norms = activity?.norms ?? [];
  const fillFromNorms = () => {
    form.setFieldValue(['lines', field.name, 'materials'], suggestMaterials(line?.quantity ?? 0, norms).map((m) => ({ itemId: m.itemId, quantity: Number(m.quantity) })));
    form.setFieldValue(['lines', field.name, 'materialsEdited'], false);
  };
  const unitOf = (itemId: string | undefined) => options?.items.find((i) => i.id === itemId)?.unit;
  const shows = (p: Parameters<typeof dprLineShows>[1]) => dprLineShows(def, p);
  const own = ownFieldsOf(def, 'LINE');
  const missing = own.some((f) => f.required && extraBody(line?.extra)[f.key] === undefined);
  return (
    <>
      <Button type="link" size="small" onClick={() => setOpen(true)} aria-label={`Details of work line ${n}`} style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }}>
        {summary || (shows('crew') || shows('material') ? 'Add crew and material' : 'Add details')}
        {missing ? <Typography.Text type="warning">{summary ? ' · ' : ' '}more to fill in</Typography.Text> : null}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={activity ? `Line ${n}: ${dprActivityLabel(activity)}` : `Line ${n}`}
        width={720}
        footer={
          <Button type="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        {shows('crew') ? (
          <Form.Item label="Labour">
            <LineTable
              name={[field.name, 'labour']}
              label={`Line ${n} labour`}
              addText="Add trade"
              newLine={() => ({ count: 1 })}
              columns={[
                {
                  key: 'category',
                  title: 'Trade',
                  render: (f) => (
                    <Form.Item name={[f.name, 'category']} noStyle>
                      <Select style={{ width: '100%' }} placeholder="Trade" aria-label={`Trade ${f.name + 1}`} options={def.lines.crewCategories.map((c) => ({ value: c, label: c }))} />
                    </Form.Item>
                  ),
                },
                {
                  key: 'count',
                  title: 'Workers',
                  width: 100,
                  align: 'right',
                  render: (f) => (
                    <Form.Item name={[f.name, 'count']} noStyle>
                      <InputNumber min={0} precision={0} inputMode="numeric" aria-label={`Workers of trade ${f.name + 1}`} style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </Form.Item>
        ) : null}
        {shows('machines') ? (
          <Form.Item label="Machinery">
            <LineTable
              name={[field.name, 'machines']}
              label={`Line ${n} machine`}
              addText="Add machine"
              newLine={() => ({ hours: 8 })}
              columns={[
                {
                  key: 'name',
                  title: 'Machine',
                  render: (f) => (
                    <Form.Item name={[f.name, 'name']} noStyle>
                      <AutoComplete placeholder="JCB 3DX" aria-label={`Machine ${f.name + 1}`} options={def.lines.machineNames.map((m) => ({ value: m }))} style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
                {
                  key: 'hours',
                  title: 'Hours',
                  width: 100,
                  align: 'right',
                  render: (f) => (
                    <Form.Item name={[f.name, 'hours']} noStyle>
                      <InputNumber min={0} max={24} inputMode="decimal" aria-label={`Hours of machine ${f.name + 1}`} style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </Form.Item>
        ) : null}
        {shows('material') ? (
          <Form.Item
            label="Material used"
            extra={norms.length ? (line?.materialsEdited ? 'Changed by hand.' : 'Filled from the norms for the quantity; change it to what was used.') : 'No norms for this activity; add what was used.'}
          >
            {norms.length && line?.materialsEdited ? (
              <Button size="small" onClick={fillFromNorms} style={{ marginBottom: 8 }}>
                Fill from the norms
              </Button>
            ) : null}
            <LineTable
              name={[field.name, 'materials']}
              label={`Line ${n} material`}
              addText="Add material"
              columns={[
                {
                  key: 'item',
                  title: 'Item',
                  render: (f) => (
                    <Form.Item name={[f.name, 'itemId']} noStyle>
                      <Select
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder="Store item"
                        aria-label={`Material ${f.name + 1}`}
                        style={{ width: '100%' }}
                        options={(options?.items ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
                      />
                    </Form.Item>
                  ),
                },
                {
                  key: 'qty',
                  title: 'Used',
                  width: 150,
                  render: (f) => (
                    <Form.Item name={[f.name, 'quantity']} noStyle>
                      <QuantityInput unit={unitOf(line?.materials?.[f.name]?.itemId)} aria-label={`Quantity of material ${f.name + 1}`} />
                    </Form.Item>
                  ),
                },
              ]}
            />
          </Form.Item>
        ) : null}
        <FormGrid cols={2}>
          {shows('workOrder') && options?.workOrders.length ? (
            <Form.Item name={[field.name, 'workOrderId']} label="Work order">
              <Select allowClear placeholder="Departmental (our own workers)" options={options.workOrders.map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }))} />
            </Form.Item>
          ) : null}
          {shows('remarks') ? (
            <Form.Item name={[field.name, 'remarks']} label="Remark">
              <Input.TextArea rows={2} maxLength={500} />
            </Form.Item>
          ) : null}
          <OwnFieldItems fields={own} path={[field.name, 'extra']} />
        </FormGrid>
        {shows('photo') ? (
          <Form.Item name={[field.name, 'photos']} label="Photo of this work">
            <PhotoUpload max={4} />
          </Form.Item>
        ) : null}
      </Modal>
    </>
  );
}
