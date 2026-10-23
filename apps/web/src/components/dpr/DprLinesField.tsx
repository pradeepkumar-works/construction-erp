'use client';

import React, { useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Tag, Typography } from 'antd';
import type { FormInstance, FormListFieldData } from 'antd';
import {
  MANPOWER_CATEGORIES,
  OUTSIDE_BREAKDOWN,
  PIPE_NODE_KIND_LABELS,
  PIPE_STAGE_LABELS,
  comparePipeCodes,
  componentLabel,
  crewCheck,
  dprActivityLabel,
  segmentLabel,
  suggestMaterials,
  type DprActivityOptionDto,
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

/** A work line as the form holds it. */
export interface DprLineValues {
  id: string;
  activityId?: string;
  quantity?: number | null;
  location?: string;
  /** The pipe segment (item 126), or for a valve line the valve, the work was on */
  pipeSegmentId?: string | null;
  pipeNodeId?: string | null;
  labour?: ManpowerLine[];
  machines?: MachineryLine[];
  materials?: { itemId?: string; quantity?: number | null }[];
  workOrderId?: string | null;
  remarks?: string;
  /** The planner changed the material by hand, so the norms no longer fill it */
  materialsEdited?: boolean;
}

export const newLine = (over: Partial<DprLineValues> = {}): DprLineValues => ({ id: crypto.randomUUID(), labour: [], machines: [], materials: [], ...over });

/** A saved line, back into the form (editing a DPR). */
export const lineValues = (l: DprLineDto): DprLineValues => ({
  id: l.id,
  activityId: l.activityId,
  quantity: Number(l.quantity),
  location: l.location ?? undefined,
  pipeSegmentId: l.pipeSegmentId,
  pipeNodeId: l.pipeNodeId,
  labour: l.labour.map((m) => ({ ...m })),
  machines: l.machines.map((m) => ({ ...m })),
  materials: l.materials.map((m) => ({ itemId: m.itemId, quantity: Number(m.quantity) })),
  workOrderId: l.workOrderId,
  remarks: l.remarks ?? undefined,
  materialsEdited: true,
});

/** Yesterday's lines as a start for today: the same work and crew, today's quantities and material to fill. */
export const copiedLine = (l: DprLineDto): DprLineValues =>
  newLine({ activityId: l.activityId, location: l.location ?? undefined, pipeSegmentId: l.pipeSegmentId, labour: l.labour.map((m) => ({ ...m })), machines: l.machines.map((m) => ({ ...m })), workOrderId: l.workOrderId });

/** The lines as the API takes them. */
export const linesBody = (lines: DprLineValues[] | undefined): DprLineInput[] =>
  (lines ?? [])
    .filter((l) => l && l.activityId)
    .map((l) => ({
      id: l.id,
      activityId: l.activityId!,
      quantity: String(l.quantity ?? ''),
      location: l.location?.trim() || null,
      pipeSegmentId: l.pipeSegmentId || null,
      pipeNodeId: l.pipeNodeId || null,
      labour: (l.labour ?? []).filter((m) => m && m.category && Number(m.count) > 0).map((m) => ({ category: m.category, count: Math.round(Number(m.count)) })),
      machines: (l.machines ?? []).filter((m) => m && m.name?.trim()).map((m) => ({ name: m.name.trim(), hours: Number(m.hours) || 0 })),
      materials: (l.materials ?? []).filter((m) => m && m.itemId && Number(m.quantity) > 0).map((m) => ({ itemId: m.itemId!, quantity: String(m.quantity) })),
      workOrderId: l.workOrderId || null,
      remarks: l.remarks?.trim() || null,
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

const crewText = (l: DprLineValues | undefined, items: Map<string, { name: string; unit: string }>) =>
  [
    (l?.labour ?? []).filter((m) => m?.category && m.count).map((m) => `${m.category} ${m.count}`).join(', '),
    (l?.machines ?? []).filter((m) => m?.name).map((m) => `${m.name} ${m.hours ?? 0} h`).join(', '),
    (l?.materials ?? [])
      .filter((m) => m?.itemId && m.quantity)
      .map((m) => `${items.get(m.itemId!)?.name ?? 'Item'} ${formatQty(m.quantity ?? 0)} ${items.get(m.itemId!)?.unit ?? ''}`.trim())
      .join(', '),
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * The DPR's work done, line by line (item 127): each line against an activity or sub-activity, where, how much today,
 * and its crew, machines and material (in a dialog per line). The activities planned this week come first.
 */
export function DprLinesField({ options, headCount }: { options: DprWorkOptionsDto | undefined; headCount: ManpowerLine[] | undefined }) {
  const form = Form.useFormInstance();
  const lines = (Form.useWatch('lines', { form, preserve: true }) ?? []) as DprLineValues[];
  const byId = useMemo(() => new Map((options?.activities ?? []).map((a) => [a.id, a])), [options]);
  const items = useMemo(() => new Map((options?.items ?? []).map((i) => [i.id, i])), [options]);
  const activityOptions = useMemo(() => groupedOptions(options?.activities ?? []), [options]);
  const check = crewCheck(lines.filter(Boolean).map((l) => ({ labour: l.labour })), headCount);

  return (
    <LineTable
      name="lines"
      label="Work"
      addText="Add work line"
      newLine={() => ({ ...newLine() })}
      columns={[
        {
          key: 'activity',
          title: 'Activity',
          width: 300,
          render: (f) => {
            const a = byId.get(lines[f.name]?.activityId ?? '');
            return (
              <>
                <Form.Item name={[f.name, 'activityId']} noStyle rules={[{ required: true, message: 'Choose the activity' }]}>
                  <Select
                    showSearch={{ optionFilterProp: 'search' }}
                    placeholder="Choose the activity"
                    aria-label={`Activity of work line ${f.name + 1}`}
                    options={activityOptions}
                    style={{ width: '100%' }}
                    popupMatchSelectWidth={420}
                  />
                </Form.Item>
                {a ? (
                  <Typography.Text type="secondary" style={{ display: 'block', marginTop: 2 }}>
                    <span translate="no">{componentLabel(a)}</span> · <span translate="no">{`${formatQty(a.doneQty)} of ${formatQty(a.plannedQty)} ${a.unit}`}</span> done
                    {a.holdPoint ? (
                      <Tag color="orange" style={{ marginInlineStart: 6 }}>
                        Hold point
                      </Tag>
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
          width: 200,
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
        {
          key: 'details',
          title: 'Crew, machines, material',
          width: 230,
          render: (f) => <LineDetails field={f} line={lines[f.name]} activity={byId.get(lines[f.name]?.activityId ?? '')} options={options} summary={crewText(lines[f.name], items)} />,
        },
      ]}
      footer={() =>
        lines.length ? (
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
  const note = (
    <Form.Item name={[f.name, 'location']} noStyle>
      <Input placeholder={segments.length || valves.length ? 'Chainage or note' : 'Lift 4, P-27 J-12 to J-13'} aria-label={`Where work line ${n} was done`} style={segments.length || valves.length ? { marginTop: 4 } : undefined} />
    </Form.Item>
  );
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
  return note;
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
  summary,
}: {
  field: FormListFieldData;
  line: DprLineValues | undefined;
  activity: DprActivityOptionDto | undefined;
  options: DprWorkOptionsDto | undefined;
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
  return (
    <>
      <Button type="link" size="small" onClick={() => setOpen(true)} aria-label={`Crew, machines and material of work line ${n}`} style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'start' }}>
        {summary || 'Add crew and material'}
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
        <Form.Item label="Crew">
          <LineTable
            name={[field.name, 'labour']}
            label={`Line ${n} crew`}
            addText="Add trade"
            newLine={() => ({ count: 1 })}
            columns={[
              {
                key: 'category',
                title: 'Trade',
                render: (f) => (
                  <Form.Item name={[f.name, 'category']} noStyle>
                    <Select style={{ width: '100%' }} placeholder="Trade" aria-label={`Trade ${f.name + 1}`} options={MANPOWER_CATEGORIES.map((c) => ({ value: c, label: c }))} />
                  </Form.Item>
                ),
              },
              {
                key: 'count',
                title: 'Nos',
                width: 100,
                align: 'right',
                render: (f) => (
                  <Form.Item name={[f.name, 'count']} noStyle>
                    <InputNumber min={0} precision={0} inputMode="numeric" aria-label={`Number of trade ${f.name + 1}`} style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
            ]}
          />
        </Form.Item>
        <Form.Item label="Machines">
          <LineTable
            name={[field.name, 'machines']}
            label={`Line ${n} machine`}
            addText="Add machine"
            newLine={() => ({ hours: 8 })}
            columns={[
              {
                key: 'name',
                title: 'Equipment',
                render: (f) => (
                  <Form.Item name={[f.name, 'name']} noStyle>
                    <Input placeholder="JCB 3DX" aria-label={`Machine ${f.name + 1}`} />
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
        <FormGrid cols={2}>
          {options?.workOrders.length ? (
            <Form.Item name={[field.name, 'workOrderId']} label="Work order">
              <Select allowClear placeholder="Done by our own crew" options={options.workOrders.map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }))} />
            </Form.Item>
          ) : null}
          <Form.Item name={[field.name, 'remarks']} label="Remark">
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </FormGrid>
      </Modal>
    </>
  );
}
