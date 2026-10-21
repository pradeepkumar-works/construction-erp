'use client';

import React, { useState } from 'react';
import { App, Button, DatePicker, Drawer, Empty, Form, Input, Select, Skeleton, Space, Table, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { EquipmentDto, EquipmentPartDto, EquipmentPartKind } from '@erp/shared';
import { EQUIPMENT_PART_KINDS, EQUIPMENT_PART_KIND_LABELS } from '@erp/shared';
import { useEquipmentParts, useSaveEquipmentPart } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { QueryError } from '@/components/common/QueryState';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';

interface PartForm {
  kind: EquipmentPartKind;
  position?: string;
  make?: string;
  serialNo?: string;
  fittedOn: dayjs.Dayjs;
  fittedMeter?: number | null;
  removedOn?: dayjs.Dayjs | null;
  removedMeter?: number | null;
  removalReason?: string;
  cost?: number | null;
  note?: string;
}

type Editing = { mode: 'fit'; part?: undefined } | { mode: 'edit' | 'off'; part: EquipmentPartDto };

const small = { fontSize: themeFontSize('fontSizeSM') };
const num = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

/**
 * Tyres and batteries on a machine (v5 item 93): what is on it now and what came off, with each one's life in hours
 * or km from the meter readings. The store manager and approvers record fitting and removal.
 */
export function EquipmentPartsDrawer({ machine, onClose }: { machine: EquipmentDto | null; onClose: () => void }) {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useEquipmentParts(machine?.id);
  const save = useSaveEquipmentPart();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form] = Form.useForm<PartForm>();
  const unit = data?.meterUnit ?? 'h';

  const open = (e: Editing) => {
    setEditing(e);
    form.resetFields();
    const current = data?.currentMeter === null || data?.currentMeter === undefined ? null : Number(data.currentMeter);
    if (e.mode === 'fit') form.setFieldsValue({ kind: 'TYRE', fittedOn: dayjs(), fittedMeter: current });
    else {
      const p = e.part;
      form.setFieldsValue({
        kind: p.kind,
        position: p.position ?? undefined,
        make: p.make ?? undefined,
        serialNo: p.serialNo ?? undefined,
        fittedOn: dayjs(p.fittedOn),
        fittedMeter: p.fittedMeter === null ? null : Number(p.fittedMeter),
        removedOn: p.removedOn ? dayjs(p.removedOn) : e.mode === 'off' ? dayjs() : null,
        removedMeter: p.removedMeter !== null ? Number(p.removedMeter) : e.mode === 'off' ? current : null,
        removalReason: p.removalReason ?? undefined,
        cost: p.cost === null ? null : Number(p.cost),
        note: p.note ?? undefined,
      });
    }
  };

  const submit = async (v: PartForm) => {
    if (!machine || !editing) return;
    const what = `${EQUIPMENT_PART_KIND_LABELS[v.kind]}${v.position?.trim() ? ` (${v.position.trim()})` : ''}`;
    await save.mutateAsync({
      equipmentId: machine.id,
      partId: editing.part?.id,
      kind: v.kind,
      position: v.position?.trim() || null,
      make: v.make?.trim() || null,
      serialNo: v.serialNo?.trim() || null,
      fittedOn: v.fittedOn.format('YYYY-MM-DD'),
      fittedMeter: num(v.fittedMeter),
      ...(editing.mode === 'fit' ? {} : { removedOn: v.removedOn ? v.removedOn.format('YYYY-MM-DD') : null, removedMeter: num(v.removedMeter), removalReason: v.removalReason?.trim() || null }),
      ...(data?.canSeeCost ? { cost: num(v.cost) } : {}),
      note: v.note?.trim() || null,
    });
    message.success(editing.mode === 'fit' ? `${what} fitted to ${machine.code}` : editing.mode === 'off' ? `${what} taken off ${machine.code}` : `${what} saved`);
  };

  const columns: TableProps<EquipmentPartDto>['columns'] = [
    {
      title: 'Part',
      key: 'part',
      render: (_, p) => (
        <div>
          <Space size={4} wrap>
            <span>{p.position ?? EQUIPMENT_PART_KIND_LABELS[p.kind]}</span>
            {p.removedOn ? <Tag style={{ margin: 0 }}>Came off</Tag> : <Tag color="green" style={{ margin: 0 }}>On now</Tag>}
          </Space>
          <div className="text-muted" style={small}>
            {[p.position ? EQUIPMENT_PART_KIND_LABELS[p.kind] : null, p.make, p.serialNo].filter(Boolean).join(' · ') || ' '}
          </div>
        </div>
      ),
    },
    {
      title: 'Fitted',
      key: 'fitted',
      width: 130,
      render: (_, p) => (
        <div>
          {formatDate(p.fittedOn)}
          {p.fittedMeter !== null ? (
            <div className="text-muted mono" style={small}>
              at {formatQty(p.fittedMeter)} {unit}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Came off',
      key: 'off',
      width: 200,
      render: (_, p) =>
        p.removedOn ? (
          <div>
            {formatDate(p.removedOn)}
            {p.removedMeter !== null ? <span className="text-muted mono"> at {formatQty(p.removedMeter)} {unit}</span> : null}
            {p.removalReason ? (
              <div className="text-muted" style={small}>
                {p.removalReason}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      title: 'Life',
      key: 'life',
      width: 120,
      align: 'right',
      render: (_, p) => (
        <div>
          {p.life !== null ? (
            <span className="mono" translate="no">
              {formatQty(p.life)} {unit}
            </span>
          ) : null}
          <div className="text-muted" style={small}>
            {p.lifeDays} day{p.lifeDays === 1 ? '' : 's'}
          </div>
        </div>
      ),
    },
    ...(data?.canSeeCost
      ? [{ title: 'Cost', dataIndex: 'cost', width: 110, align: 'right' as const, render: (v: string | null) => (v === null ? <span className="text-muted">-</span> : <span className="mono" translate="no">{formatINR(v)}</span>) }]
      : []),
    ...(data?.canEdit
      ? [
          {
            title: '',
            key: 'actions',
            width: 150,
            render: (_: unknown, p: EquipmentPartDto) => (
              <Space size={0}>
                {p.removedOn ? null : (
                  <Button type="link" size="small" onClick={() => open({ mode: 'off', part: p })} aria-label={`Take off ${p.position ?? EQUIPMENT_PART_KIND_LABELS[p.kind]}`}>
                    Take off
                  </Button>
                )}
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open({ mode: 'edit', part: p })} aria-label={`Edit ${p.position ?? EQUIPMENT_PART_KIND_LABELS[p.kind]}`} />
                <ConfirmDelete what={`this ${EQUIPMENT_PART_KIND_LABELS[p.kind].toLowerCase()} entry`} onConfirm={() => save.mutateAsync({ equipmentId: p.equipmentId, partId: p.id, remove: true })}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${p.position ?? EQUIPMENT_PART_KIND_LABELS[p.kind]}`} />
                </ConfirmDelete>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const off = editing?.mode === 'off';
  const showRemoval = editing?.mode === 'off' || (editing?.mode === 'edit' && !!editing.part.removedOn);
  return (
    <Drawer
      open={!!machine}
      onClose={onClose}
      size={860}
      destroyOnHidden
      title={machine ? `Tyres and batteries · ${machine.code}` : 'Tyres and batteries'}
      extra={
        data?.canEdit ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ mode: 'fit' })}>
            Fit a tyre or battery
          </Button>
        ) : null
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {isLoading && <Skeleton active />}
      {data && (
        <>
          <Typography.Paragraph type="secondary" style={small}>
            {machine?.name}. Latest {unit === 'km' ? 'odometer' : 'hour meter'} reading:{' '}
            <span className="mono" translate="no">
              {data.currentMeter === null ? 'none yet' : `${formatQty(data.currentMeter)} ${unit}`}
            </span>
            . Life runs from fitting to removal, or to that reading while a part is still on.
          </Typography.Paragraph>
          <Table<EquipmentPartDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.parts}
            scroll={{ x: 820 }}
            columns={columns}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={data.canEdit ? 'No tyres or batteries recorded. Add one with Fit a tyre or battery.' : 'No tyres or batteries recorded'} /> }}
          />
        </>
      )}
      <FormShell
        open={!!editing}
        onClose={() => setEditing(null)}
        form={form}
        layout="modal"
        width={640}
        projectDefault={false}
        title={editing?.mode === 'fit' ? `Fit to ${machine?.code ?? ''}` : off ? `Take off ${editing?.part.position ?? ''}`.trim() : 'Edit tyre or battery'}
        okText={editing?.mode === 'fit' ? 'Save' : off ? 'Take it off' : 'Save'}
        onSubmit={submit}
      >
        <Form form={form} layout="vertical">
          <FormGrid cols={2}>
            <Form.Item name="kind" label="Kind" rules={[{ required: true, message: 'Choose tyre or battery' }]} hidden={off}>
              <Select options={EQUIPMENT_PART_KINDS.map((k) => ({ value: k, label: EQUIPMENT_PART_KIND_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="position" label="Position" hidden={off}>
              <Input maxLength={60} placeholder="Front left, Rear right outer, Battery 1" />
            </Form.Item>
            <Form.Item name="make" label="Make" hidden={off}>
              <Input maxLength={80} placeholder="MRF Muscle Grip 14.00-24" />
            </Form.Item>
            <Form.Item name="serialNo" label="Serial no." hidden={off}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="fittedOn" label="Fitted on" rules={[{ required: true, message: 'Pick the date it was fitted' }]} hidden={off}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="fittedMeter" label={`Meter when fitted (${unit})`} hidden={off}>
              <QuantityInput unit={unit} precision={1} />
            </Form.Item>
            {data?.canSeeCost ? (
              <Form.Item name="cost" label="Cost" hidden={off}>
                <MoneyInput />
              </Form.Item>
            ) : null}
            {showRemoval ? (
              <>
                <Form.Item name="removedOn" label="Came off on" rules={[{ required: off, message: 'Pick the date it came off' }]}>
                  <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item name="removedMeter" label={`Meter when it came off (${unit})`}>
                  <QuantityInput unit={unit} precision={1} />
                </Form.Item>
              </>
            ) : null}
          </FormGrid>
          {showRemoval ? (
            <Form.Item name="removalReason" label="Why it came off" rules={[{ required: off, whitespace: true, message: 'Say why it came off, e.g. worn out or cut' }]}>
              <Input maxLength={200} placeholder="Worn out, sidewall cut, would not hold charge" />
            </Form.Item>
          ) : null}
          <Form.Item name="note" label="Note" hidden={off}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </FormShell>
    </Drawer>
  );
}
