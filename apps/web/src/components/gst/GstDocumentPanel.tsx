'use client';

import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Flex, Form, Input, InputNumber, QRCode, Select, Typography } from 'antd';
import { tk } from '@/ds';
import type { GstDocumentDto, GstSourceKind, GstSourceStateDto, TransportMode, VehicleType } from '@erp/shared';
import {
  EWAY_MAX_KM,
  EWB_CANCEL_REASONS,
  EWB_EXTEND_REASONS,
  GST_STATES,
  GST_DOCUMENT_KIND_LABELS,
  GST_DOCUMENT_STATUS_LABELS,
  IRN_CANCEL_REASONS,
  TRANSPORT_MODES,
  VEHICLE_NO_PATTERN,
  VEHICLE_TYPES,
  normaliseVehicleNo,
} from '@erp/shared';
import { useGstActions, useGstSource } from '@/lib/queries';
import { formatDateTime, formatINR, NO_VALUE } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { Help } from '@/components/common/Help';
import { Section } from '@/components/common/Section';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, upper } from '@/components/form/inputs';
import { PRINT } from '@/components/print/printBrand';
import type { RecordSection } from '@/components/record/RecordFrame';

const options = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
/** The facts' column gives way to the QR at ten 32 steps, about the width of the QR and its gap. */
const FACTS_BASIS = `calc(${tk.space[8]} * 10)`;
const stateOptions = Object.entries(GST_STATES).map(([value, label]) => ({ value, label }));
const mono = (v: string | null | undefined) => (v ? <span className="mono" translate="no">{v}</span> : NO_VALUE);

type MakeValues = { mode: TransportMode; vehicleNo?: string; vehicleType: VehicleType; distanceKm?: number };
type CancelValues = { reason: string; remark: string };
type ExtendValues = { fromPlace: string; fromState: string; remainingKm?: number; vehicleNo?: string; mode: TransportMode; reason: string; remark: string };

const vehicleRule = ({ getFieldValue }: { getFieldValue: (k: string) => unknown }) => ({
  validator: async (_: unknown, v: string | undefined) => {
    if (getFieldValue('mode') !== '1') return;
    const n = normaliseVehicleNo(v);
    if (!n) throw new Error('Type the vehicle number, for example OD02AB1234');
    if (!VEHICLE_NO_PATTERN.test(n)) throw new Error('Type the vehicle number as on the plate, for example OD02AB1234');
  },
});
const kmRule = { required: true, type: 'integer' as const, min: 1, max: EWAY_MAX_KM, message: `Type the distance by road in whole kilometres, 1 to ${EWAY_MAX_KM}` };

/** One IRN or e-way bill's facts: its number, acknowledgement or validity, and the QR for an IRN. */
function DocumentFacts({ d }: { d: GstDocumentDto }) {
  const irn = d.kind === 'IRN';
  return (
    <Flex gap={tk.space[4]} wrap align="flex-start">
      <Descriptions
        size="small"
        column={1}
        style={{ flex: `1 1 ${FACTS_BASIS}`, minWidth: 0 }}
        items={[
          { key: 'n', label: irn ? 'IRN' : 'E-way bill no.', children: <Typography.Text copyable={d.number ? { text: d.number } : false} style={{ wordBreak: 'break-all' }}>{mono(d.number)}</Typography.Text> },
          ...(irn
            ? [
                { key: 'a', label: 'Ack no.', children: mono(d.ackNo) },
                { key: 'ad', label: 'Ack date', children: d.ackAt ? formatDateTime(d.ackAt) : NO_VALUE },
              ]
            : [
                { key: 'v', label: 'Valid until', children: d.validUntil ? formatDateTime(d.validUntil) : NO_VALUE },
                { key: 'vh', label: 'Vehicle', children: mono(d.vehicleNo) },
                { key: 'km', label: 'Distance', children: d.distanceKm ? <span translate="no">{`${d.distanceKm} km`}</span> : NO_VALUE },
                ...(d.extensions ? [{ key: 'x', label: 'Extended', children: `${d.extensions} times` }] : []),
              ]),
          { key: 'by', label: 'Made by', children: `${d.createdByName}, ${formatDateTime(d.createdAt)}` },
          ...(d.provider === 'FAKE' ? [{ key: 'p', label: 'Provider', children: <AppTag meaning="waiting">Stand-in, not registered</AppTag> }] : []),
        ]}
      />
      {irn && d.signedQr ? <QRCode value={d.signedQr} size={160} type="svg" bordered={false} color={PRINT.ink} bgColor={PRINT.paper} aria-label="E-invoice QR code" /> : null}
    </Flex>
  );
}

/**
 * A record's e-invoice or e-way bill (item 194): what it lacks, Generate, the live one with its QR or validity, Cancel
 * within 24 hours, Extend near the end, and the earlier ones. The rules are the server's (`GstSourceStateDto`).
 */
export function GstDocumentPanel({ sourceKind, sourceId, state }: { sourceKind: GstSourceKind; sourceId: string; state: GstSourceStateDto }) {
  const { message } = App.useApp();
  const act = useGstActions(sourceKind, sourceId);
  const [open, setOpen] = useState<'make' | 'cancel' | 'extend' | null>(null);
  const [make] = Form.useForm<MakeValues>();
  const [cancel] = Form.useForm<CancelValues>();
  const [extend] = Form.useForm<ExtendValues>();
  const irn = state.kind === 'IRN';
  const word = irn ? 'IRN' : 'e-way bill';
  const live = state.live;

  if (!state.offered) return <Typography.Text type="secondary">{state.reason}</Typography.Text>;

  const generateIrn = async () => {
    const s = await act.generate.mutateAsync({});
    if (s.live?.status === 'ACTIVE') message.success(`IRN made for ${s.docNo}`);
  };
  const openMake = () => {
    make.resetFields();
    make.setFieldsValue({ mode: '1', vehicleType: 'R', vehicleNo: state.vehicleNo ?? undefined });
    setOpen('make');
  };
  const openExtend = () => {
    extend.resetFields();
    extend.setFieldsValue({ mode: '1', vehicleNo: live?.vehicleNo ?? undefined, reason: '99' });
    setOpen('extend');
  };

  return (
    <Flex vertical gap={tk.space[3]}>
      {!state.providerReady && state.providerProblem ? <Alert type="info" showIcon title={state.providerProblem} /> : null}
      {live ? (
        <>
          <Flex gap={tk.space[2]} align="center" wrap>
            <AppTag kind="gstDocument" status={live.status}>
              {GST_DOCUMENT_STATUS_LABELS[live.status]}
            </AppTag>
            {live.status === 'PENDING' ? <Typography.Text type="secondary">No answer was kept from the last try: generate it again to ask</Typography.Text> : null}
          </Flex>
          {live.status === 'ACTIVE' ? <DocumentFacts d={live} /> : null}
          <Flex gap={tk.space[2]} wrap align="center">
            {live.status === 'PENDING' && state.canGenerate ? (
              <Button type="primary" loading={act.generate.isPending} onClick={irn ? generateIrn : openMake}>
                {irn ? 'Generate IRN' : 'Generate e-way bill'}
              </Button>
            ) : null}
            {state.canExtend ? <Button onClick={openExtend}>Extend validity</Button> : null}
            {state.canCancel ? (
              <Button
                danger
                onClick={() => {
                  cancel.resetFields();
                  setOpen('cancel');
                }}
              >
                {irn ? 'Cancel IRN' : 'Cancel e-way bill'}
              </Button>
            ) : null}
            {live.status === 'ACTIVE' && state.cancelBy && state.canCancel ? <Typography.Text type="secondary">{`Can be cancelled until ${formatDateTime(state.cancelBy)}`}</Typography.Text> : null}
            {live.status === 'ACTIVE' && state.cancelProblem ? <Typography.Text type="secondary">{state.cancelProblem}</Typography.Text> : null}
            {!irn && live.status === 'ACTIVE' && state.extendProblem ? <Help label="About extending">{state.extendProblem}</Help> : null}
          </Flex>
        </>
      ) : (
        <>
          <Typography.Text type={state.needed ? undefined : 'secondary'}>{state.reason}</Typography.Text>
          {state.problems.length ? (
            <Alert
              type="warning"
              showIcon
              title={`Before the ${word} can be made`}
              description={
                <ul style={{ margin: 0, paddingLeft: tk.space[4] }}>
                  {state.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              }
            />
          ) : null}
          {state.warnings.length ? (
            <Alert
              type="info"
              showIcon
              title={state.warnings.length === 1 ? state.warnings[0] : `Before generating the ${word}`}
              description={
                state.warnings.length > 1 ? (
                  <ul style={{ margin: 0, paddingLeft: tk.space[4] }}>
                    {state.warnings.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          ) : null}
          {state.canGenerate ? (
            <div>
              <Button type="primary" loading={act.generate.isPending} onClick={irn ? generateIrn : openMake}>
                {irn ? 'Generate IRN' : 'Generate e-way bill'}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {state.history.length ? (
        <Flex vertical gap={tk.space[1]}>
          <Typography.Text strong>Earlier</Typography.Text>
          {state.history.map((d) => (
            <Flex key={d.id} gap={tk.space[2]} wrap align="baseline">
              <AppTag kind="gstDocument" status={d.status}>
                {GST_DOCUMENT_STATUS_LABELS[d.status]}
              </AppTag>
              {d.number ? <span style={{ wordBreak: 'break-all', minWidth: 0 }}>{mono(d.number)}</span> : null}
              <Typography.Text type="secondary">
                {d.status === 'CANCELLED'
                  ? `${formatDateTime(d.cancelledAt)}${d.cancelRemark ? `: ${d.cancelRemark}` : ''}`
                  : `${formatDateTime(d.createdAt)}${d.error ? `: ${d.error}` : ''}`}
              </Typography.Text>
            </Flex>
          ))}
        </Flex>
      ) : null}

      <FormShell
        open={open === 'make'}
        onClose={() => setOpen(null)}
        form={make}
        layout="modal"
        width={520}
        title="Generate e-way bill"
        okText="Generate"
        onSubmit={async (v) => {
          const s = await act.generate.mutateAsync({ mode: v.mode, vehicleNo: v.mode === '1' ? normaliseVehicleNo(v.vehicleNo) : null, vehicleType: v.vehicleType, distanceKm: v.distanceKm });
          if (s.live?.status === 'ACTIVE') message.success(`E-way bill ${s.live.number} made, valid until ${formatDateTime(s.live.validUntil)}`);
        }}
      >
        <Form form={make} layout="vertical">
          {state.value ? <Typography.Paragraph type="secondary">{`${state.docNo}, ${formatINR(state.value, true)} before tax`}</Typography.Paragraph> : null}
          <FormGrid cols={2}>
            <Form.Item name="mode" label="Goes by" rules={[{ required: true, message: 'Choose how the goods go' }]}>
              <Select options={options(TRANSPORT_MODES)} />
            </Form.Item>
            <Form.Item name="vehicleType" label="Vehicle type">
              <Select options={options(VEHICLE_TYPES)} />
            </Form.Item>
            <Form.Item name="vehicleNo" label="Vehicle no." normalize={upper} dependencies={['mode']} rules={[vehicleRule]}>
              <Input {...CODE_INPUT} maxLength={20} placeholder="e.g. OD02AB1234" />
            </Form.Item>
            <Form.Item name="distanceKm" label="Distance by road (km)" rules={[kmRule]} tooltip="From the plant or store to the site; the e-way bill runs a day for each 200 km">
              <InputNumber min={1} max={EWAY_MAX_KM} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
        </Form>
      </FormShell>

      <FormShell
        open={open === 'cancel'}
        onClose={() => setOpen(null)}
        form={cancel}
        layout="modal"
        width={480}
        title={irn ? 'Cancel IRN' : 'Cancel e-way bill'}
        okText={irn ? 'Cancel IRN' : 'Cancel e-way bill'}
        cancelText="Keep it"
        onSubmit={async (v) => {
          await act.cancel.mutateAsync({ id: live!.id, reason: v.reason, remark: v.remark.trim() });
          message.success(`${GST_DOCUMENT_KIND_LABELS[state.kind]} ${live!.number} cancelled`);
        }}
      >
        <Form form={cancel} layout="vertical">
          <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Choose the reason' }]}>
            <Select options={options(irn ? IRN_CANCEL_REASONS : EWB_CANCEL_REASONS)} />
          </Form.Item>
          <Form.Item name="remark" label="Remark" rules={[{ required: true, min: 3, whitespace: true, message: 'Say why, in a few words' }]}>
            <Input maxLength={100} />
          </Form.Item>
        </Form>
      </FormShell>

      <FormShell
        open={open === 'extend'}
        onClose={() => setOpen(null)}
        form={extend}
        layout="modal"
        width={520}
        title="Extend validity"
        okText="Extend"
        onSubmit={async (v) => {
          const s = await act.extend.mutateAsync({
            id: live!.id,
            fromPlace: v.fromPlace.trim(),
            fromState: v.fromState,
            remainingKm: v.remainingKm!,
            vehicleNo: v.mode === '1' ? normaliseVehicleNo(v.vehicleNo) : null,
            mode: v.mode,
            reason: v.reason,
            remark: v.remark.trim(),
          });
          message.success(`E-way bill ${live!.number} valid until ${formatDateTime(s.live?.validUntil)}`);
        }}
      >
        <Form form={extend} layout="vertical">
          <Form.Item name="fromPlace" label="Where the goods are now" rules={[{ required: true, pattern: /\b[1-9][0-9]{5}\b/, message: 'Type the place with its PIN code, e.g. Cuttack 753001' }]}>
            <Input maxLength={200} placeholder="e.g. Cuttack 753001" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="fromState" label="State the goods are in now" rules={[{ required: true, message: 'Choose the state the goods are in now' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} options={stateOptions} />
            </Form.Item>
            <Form.Item name="remainingKm" label="Distance left (km)" rules={[kmRule]}>
              <InputNumber min={1} max={EWAY_MAX_KM} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="mode" label="Goes by" rules={[{ required: true, message: 'Choose how the goods go' }]}>
              <Select options={options(TRANSPORT_MODES)} />
            </Form.Item>
            <Form.Item name="vehicleNo" label="Vehicle no." normalize={upper} dependencies={['mode']} rules={[vehicleRule]}>
              <Input {...CODE_INPUT} maxLength={20} placeholder="e.g. OD02AB1234" />
            </Form.Item>
            <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Choose the reason' }]}>
              <Select options={options(EWB_EXTEND_REASONS)} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="remark" label="Remark" rules={[{ required: true, min: 3, whitespace: true, message: 'Say why, in a few words' }]}>
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </FormShell>
    </Flex>
  );
}

/** The record section for a source's IRN or e-way bill; null until there is a source to ask about. */
export function useGstSection(sourceKind: GstSourceKind, sourceId: string | undefined, enabled: boolean): { section: RecordSection | null; state: GstSourceStateDto | undefined } {
  const { data } = useGstSource(sourceKind, sourceId, enabled);
  if (!enabled || !sourceId || !data) return { section: null, state: data };
  const title = GST_DOCUMENT_KIND_LABELS[data.kind];
  return {
    state: data,
    section: { key: 'gst', title, empty: !data.offered, children: <GstDocumentPanel sourceKind={sourceKind} sourceId={sourceId} state={data} /> },
  };
}

/** The same panel under its own title, for a drawer that is not a record frame (a challan, a stock transfer, an RMC bill). */
export function GstDocumentBlock({ sourceKind, sourceId, enabled = true }: { sourceKind: GstSourceKind; sourceId: string; enabled?: boolean }) {
  const { data } = useGstSource(sourceKind, sourceId, enabled);
  if (!enabled || !data) return null;
  return (
    <Section title={GST_DOCUMENT_KIND_LABELS[data.kind]} style={{ marginTop: tk.space[4] }}>
      <GstDocumentPanel sourceKind={sourceKind} sourceId={sourceId} state={data} />
    </Section>
  );
}
