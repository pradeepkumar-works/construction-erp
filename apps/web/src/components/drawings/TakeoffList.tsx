'use client';

import { revLabel } from '@/components/documents/docUi';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Flex, Form, Input, Radio, Segmented, Select, Space, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { BookOutlined, ColumnWidthOutlined, DeleteOutlined, EditOutlined, TableOutlined } from '@/components/common/icons';
import type { BoqItemDto, DrawingScaleDto, DrawingTakeoffDto, TakeoffBoqField, TakeoffKind } from '@erp/shared';
import { DRAWING_UNIT_METRES, TAKEOFF_KINDS, TAKEOFF_KIND_LABELS, TAKEOFF_LABEL_MAX, TAKEOFF_UNITS, canEditMarkup, takeoffBoqQty, takeoffTotal, type DrawingUnit } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useBoq } from '@/lib/queries';
import { formatDate, formatQty, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import type { ListScope } from './MarkupList';
import { TAKEOFF_INK } from './TakeoffLayer';

/** "12.450 m", "14 nos". */
export const takeoffFigure = (kind: TakeoffKind, value: string | number) => `${kind === 'COUNT' ? Number(value) : formatQty(value)} ${TAKEOFF_UNITS[kind]}`;

/**
 * The measures beside the drawing (v6 item 118): the sheet's scale, the measures (this sheet's or the whole drawing's)
 * with their totals by kind, and the ones ticked put into the measurement book or set as a BOQ item's quantity.
 */
export function TakeoffList({
  takeoffs,
  scale,
  scope,
  onScope,
  selectedId,
  onPick,
  chosen,
  onChoose,
  onSetScale,
  drawingWidth,
  onScaleFromUnits,
  onRename,
  onDelete,
  onToMeasurement,
  onToBoq,
  canMeasure,
  canSetBoq,
}: {
  takeoffs: DrawingTakeoffDto[];
  /** This sheet's scale, if set */
  scale: DrawingScaleDto | null;
  scope: ListScope;
  onScope: (s: ListScope) => void;
  selectedId: string | null;
  onPick: (t: DrawingTakeoffDto) => void;
  chosen: Set<string>;
  onChoose: (ids: Set<string>) => void;
  onSetScale: () => void;
  /** A DXF's width in its drawing units, so its scale can come from them */
  drawingWidth?: number;
  onScaleFromUnits: (unit: DrawingUnit) => Promise<unknown>;
  onRename: (t: DrawingTakeoffDto) => void;
  onDelete: (t: DrawingTakeoffDto) => Promise<unknown>;
  onToMeasurement: (ts: DrawingTakeoffDto[]) => void;
  onToBoq: (ts: DrawingTakeoffDto[]) => void;
  canMeasure: boolean;
  canSetBoq: boolean;
}) {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const [unit, setUnit] = useState<DrawingUnit>('mm');
  const [unitBusy, setUnitBusy] = useState(false);
  const picked = takeoffs.filter((t) => chosen.has(t.id));
  const totals = TAKEOFF_KINDS.map((k) => ({
    kind: k,
    list: takeoffs.filter((t) => t.kind === k),
  })).filter((x) => x.list.length);
  const pickedTotal = takeoffBoqQty(picked);
  const allChosen = takeoffs.length > 0 && takeoffs.every((t) => chosen.has(t.id));
  return (
    <Flex vertical gap={token.marginSM}>
      <Flex justify="space-between" align="center" wrap gap={token.marginXS}>
        <Typography.Title level={2} style={{ fontSize: themeFontSize('fontSizeLG'), margin: 0 }}>
          Measures{' '}
          <Typography.Text type="secondary" style={{ fontWeight: 400 }} translate="no">
            {takeoffs.length}
          </Typography.Text>
        </Typography.Title>
        <Segmented
          size="small"
          value={scope}
          onChange={(v) => onScope(v as ListScope)}
          options={[
            { value: 'sheet', label: 'This sheet' },
            { value: 'all', label: 'Whole drawing' },
          ]}
          aria-label="Which measures to list"
        />
      </Flex>
      {scale ? (
        <Flex justify="space-between" align="center" gap={token.marginXS} wrap style={{ fontSize: themeFontSize('fontSizeSM') }}>
          <span>
            Scale: <span translate="no">{formatQty(scale.lengthM)} m</span> between two points · {scale.setByName}, {formatDate(scale.updatedAt)}
          </span>
          <Button size="small" icon={<ColumnWidthOutlined />} onClick={onSetScale}>
            Set again
          </Button>
        </Flex>
      ) : (
        <Alert
          type="info"
          showIcon
          title="Set the scale first"
          description={
            <Flex vertical gap={token.marginXS}>
              <p style={{ margin: 0 }}>Click two points a known distance apart, such as a dimensioned wall or the grid spacing, and enter the distance. Counts need no scale.</p>
              <Space wrap>
                <Button size="small" icon={<ColumnWidthOutlined />} onClick={onSetScale}>
                  Set the scale
                </Button>
                {drawingWidth ? (
                  <Space.Compact>
                    <Select
                      size="small"
                      aria-label="The DXF's drawing units"
                      value={unit}
                      onChange={setUnit}
                      options={(Object.keys(DRAWING_UNIT_METRES) as DrawingUnit[]).map((u) => ({ value: u, label: `Drawn in ${u}` }))}
                    />
                    <Button
                      size="small"
                      loading={unitBusy}
                      onClick={async () => {
                        setUnitBusy(true);
                        try {
                          await onScaleFromUnits(unit);
                        } finally {
                          setUnitBusy(false);
                        }
                      }}
                    >
                      Use
                    </Button>
                  </Space.Compact>
                ) : null}
              </Space>
            </Flex>
          }
        />
      )}
      {totals.length ? (
        <Flex gap={token.marginSM} wrap style={{ fontSize: themeFontSize('fontSizeSM') }}>
          {totals.map((x) => (
            <span key={x.kind}>
              {TAKEOFF_KIND_LABELS[x.kind]}s{' '}
              <Typography.Text strong translate="no">
                {takeoffFigure(x.kind, takeoffTotal(x.list.map((t) => t.value)))}
              </Typography.Text>
            </span>
          ))}
        </Flex>
      ) : null}
      {!takeoffs.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={scope === 'sheet' ? 'No measures on this sheet yet. Pick Length, Area or Count above and click on the drawing.' : 'No measures on this drawing yet.'}
        />
      ) : (
        <>
          <Flex justify="space-between" align="center" wrap gap={token.marginXS}>
            <Checkbox checked={allChosen} indeterminate={!allChosen && picked.length > 0} onChange={(e) => onChoose(new Set(e.target.checked ? takeoffs.map((t) => t.id) : []))}>
              Tick all
            </Checkbox>
            <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {picked.length
                ? 'qty' in pickedTotal
                  ? `${picked.length} ticked: ${takeoffFigure(picked[0].kind, pickedTotal.qty)}`
                  : `${picked.length} ticked, of more than one kind`
                : 'Tick measures to use them'}
            </Typography.Text>
          </Flex>
          {canMeasure || canSetBoq ? (
            <Space wrap>
              {canMeasure ? (
                <Button size="small" icon={<BookOutlined />} disabled={!picked.length} onClick={() => onToMeasurement(picked)}>
                  Add to measurement book
                </Button>
              ) : null}
              {canSetBoq ? (
                <Button size="small" icon={<TableOutlined />} disabled={!('qty' in pickedTotal)} onClick={() => onToBoq(picked)}>
                  Set BOQ quantity
                </Button>
              ) : null}
            </Space>
          ) : null}
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: token.marginXS,
            }}
            aria-label="Measures"
          >
            {takeoffs.map((t) => {
              const edit = !!user && canEditMarkup(user.roleKey, t.createdById === user.id);
              const selected = t.id === selectedId;
              return (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    gap: token.marginXS,
                    alignItems: 'flex-start',
                    border: `1px solid ${selected ? token.colorPrimary : token.colorBorderSecondary}`,
                    borderRadius: token.borderRadiusLG,
                    padding: token.paddingSM,
                    background: selected ? token.colorPrimaryBg : token.colorBgContainer,
                  }}
                >
                  <Checkbox
                    checked={chosen.has(t.id)}
                    aria-label={`Tick T${t.takeoffNo}`}
                    onChange={(e) => onChoose(toggle(chosen, t.id, e.target.checked))}
                    style={{ minHeight: 24, paddingTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => onPick(t)}
                      aria-current={selected || undefined}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'block',
                        width: '100%',
                        minHeight: 44,
                        boxSizing: 'border-box',
                      }}
                    >
                      <Space size={6} wrap>
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: TAKEOFF_INK,
                          }}
                        />
                        <Typography.Text strong translate="no">
                          T{t.takeoffNo}
                        </Typography.Text>
                        <Typography.Text type="secondary">{TAKEOFF_KIND_LABELS[t.kind]}</Typography.Text>
                        <Typography.Text strong translate="no">
                          {takeoffFigure(t.kind, t.value)}
                        </Typography.Text>
                        {scope === 'all' ? (
                          <AppTag translate="no" style={{ margin: 0 }}>
                            {revLabel(t.revision)}
                            {t.page > 1 ? `, p ${t.page}` : ''}
                          </AppTag>
                        ) : null}
                        {t.mbNo ? (
                          <AppTag translate="no" style={{ margin: 0 }}>
                            In {t.mbNo}
                          </AppTag>
                        ) : null}
                      </Space>
                      <div style={{ marginTop: 2, overflowWrap: 'anywhere' }}>{t.label}</div>
                      <div
                        className="text-muted"
                        style={{
                          fontSize: themeFontSize('fontSizeSM'),
                          marginTop: 2,
                        }}
                      >
                        {t.createdByName} · {formatDate(t.createdAt)}
                      </div>
                    </button>
                  </div>
                  {edit ? (
                    <Flex vertical gap={2}>
                      <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Rename T${t.takeoffNo}`} onClick={() => onRename(t)} />
                      <ConfirmDelete what={`measure T${t.takeoffNo}`} onConfirm={() => onDelete(t)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete measure T${t.takeoffNo}`} />
                      </ConfirmDelete>
                    </Flex>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Flex>
  );
}

function toggle(set: Set<string>, id: string, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** What a measure is called: asked when it is finished, and when renamed. */
export function TakeoffLabelForm({
  open,
  title,
  figure,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  /** What it comes to, shown above the name */
  figure?: string | null;
  initial?: string;
  onClose: () => void;
  onSubmit: (label: string) => Promise<unknown>;
}) {
  const [form] = Form.useForm<{ label: string }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ label: initial ?? '' });
  }, [open, initial, form]);
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={480} title={title} okText="Save" onSubmit={(v) => onSubmit(v.label.trim())}>
      <Form form={form} layout="vertical">
        {figure ? (
          <Typography.Paragraph strong style={{ fontSize: themeFontSize('fontSizeLG') }} translate="no">
            {figure}
          </Typography.Paragraph>
        ) : null}
        <Form.Item
          name="label"
          label="What it is"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Say what it is, e.g. "Plinth beam, grid A"',
            },
          ]}
        >
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks */}
          <Input maxLength={TAKEOFF_LABEL_MAX} autoFocus placeholder="e.g. Plinth beam, grid A" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

const DISTANCE_UNITS = { m: 1, mm: 0.001, cm: 0.01, ft: 0.3048 } as const;
type DistanceUnit = keyof typeof DISTANCE_UNITS;

/** The real distance between the two points just clicked. */
export function ScaleForm({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (lengthM: number) => Promise<unknown> }) {
  const [form] = Form.useForm<{ length: number; unit: DistanceUnit }>();
  useEffect(() => {
    if (open) form.setFieldsValue({ length: undefined, unit: 'm' });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={440}
      title="Set the scale"
      okText="Set scale"
      onSubmit={(v) => onSubmit(Math.round(v.length * DISTANCE_UNITS[v.unit] * 1000) / 1000)}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">The real distance between the two points you clicked. Lengths and areas already on this sheet are worked out again.</Typography.Paragraph>
        <FormGrid cols={2}>
          <Form.Item
            name="length"
            label="Distance"
            rules={[
              {
                required: true,
                message: 'Enter the distance between the points',
              },
            ]}
          >
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks */}
            <QuantityInput autoFocus placeholder="e.g. 6.000" />
          </Form.Item>
          <Form.Item name="unit" label="In">
            <Select options={(Object.keys(DISTANCE_UNITS) as DistanceUnit[]).map((u) => ({ value: u, label: u === 'ft' ? 'feet' : u }))} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

/** Words a BOQ unit is written with, for each kind of measure, to warn when they differ. */
const UNIT_WORDS: Record<TakeoffKind, string[]> = {
  LENGTH: ['m', 'rm', 'rmt', 'mtr', 'metre', 'meter', 'lm', 'running metre', 'rm.'],
  AREA: ['sqm', 'sq.m', 'sq m', 'm2', 'm²', 'sq.mt', 'sqmt', 'smt'],
  COUNT: ['nos', 'no', 'no.', 'each', 'nr', 'set', 'pcs', 'number'],
};
const unitFits = (kind: TakeoffKind, unit: string) => UNIT_WORDS[kind].includes(unit.trim().toLowerCase());

interface BoqValues {
  boqItemId: string;
  field: TakeoffBoqField;
  factor?: number | null;
}

/** A BOQ item's original or revised quantity from the ticked measures, times a factor. */
export function TakeoffBoqForm({
  open,
  projectId,
  measures,
  onClose,
  onSubmit,
}: {
  open: boolean;
  projectId: string;
  measures: DrawingTakeoffDto[];
  onClose: () => void;
  onSubmit: (v: { boqItemId: string; field: TakeoffBoqField; factor?: number; item: BoqItemDto; qty: number }) => Promise<unknown>;
}) {
  const [form] = Form.useForm<BoqValues>();
  const { data: boq } = useBoq(open ? projectId : undefined);
  const boqItemId = Form.useWatch('boqItemId', form);
  const field = Form.useWatch('field', form);
  const factor = Form.useWatch('factor', form);
  const item = boq?.find((b) => b.id === boqItemId);
  const kind = measures[0]?.kind;
  const got = takeoffBoqQty(measures, factor || 1);
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        boqItemId: undefined,
        field: 'REVISED',
        factor: null,
      });
  }, [open, form]);
  const options = useMemo(
    () =>
      (boq ?? []).map((b) => ({
        value: b.id,
        label: `${b.itemNo} - ${b.description} (${b.unit})`,
      })),
    [boq],
  );
  const now = item ? (field === 'ORIGINAL' ? item.originalQty : item.revisedQty) : null;
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      title="Set a BOQ quantity"
      okText="Set quantity"
      onSubmit={(v) =>
        onSubmit({
          boqItemId: v.boqItemId,
          field: v.field,
          factor: v.factor || undefined,
          item: item!,
          qty: 'qty' in got ? got.qty : 0,
        })
      }
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          <span translate="no">{measures.map((m) => `T${m.takeoffNo}`).join(', ')}</span> come to{' '}
          <Typography.Text strong translate="no">
            {kind ? takeoffFigure(kind, takeoffTotal(measures.map((m) => m.value))) : ''}
          </Typography.Text>
          .
        </Typography.Paragraph>
        <Form.Item name="boqItemId" label="BOQ item" rules={[{ required: true, message: 'Choose the BOQ item' }]}>
          <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Choose the BOQ item" options={options} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="field" label="Quantity to set">
            <Radio.Group
              options={[
                { value: 'REVISED', label: 'Revised' },
                { value: 'ORIGINAL', label: 'Original (tender)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="factor" label="Multiply by (optional)" extra="e.g. a slab's thickness in metres, for cubic metres">
            <QuantityInput placeholder="1" />
          </Form.Item>
        </FormGrid>
        {item && kind && !unitFits(kind, item.unit) && !(factor && factor !== 1) ? (
          <Alert
            type="warning"
            showIcon
            title={`${item.itemNo} is in ${item.unit} and these are in ${TAKEOFF_UNITS[kind]}`}
            description="Multiply by a thickness or a weight per metre if need be, or choose another item."
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {item && 'qty' in got ? (
          <Typography.Paragraph translate="no">
            {item.itemNo}&apos;s {field === 'ORIGINAL' ? 'original' : 'revised'} quantity becomes{' '}
            <Typography.Text strong>
              {formatQty(got.qty)} {item.unit}
            </Typography.Text>
            {now !== null && now !== undefined ? ` (now ${formatQty(toNumber(now))})` : ''}.
          </Typography.Paragraph>
        ) : 'problem' in got ? (
          <Alert type="error" showIcon title={got.problem} />
        ) : null}
      </Form>
    </FormShell>
  );
}
