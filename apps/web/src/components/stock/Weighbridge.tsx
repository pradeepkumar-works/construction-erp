'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Dropdown, Empty, Flex, Form, Input, InputNumber, Radio, Select, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import type { ShortCheck, WeighingDto, WeighTicketDto } from '@erp/shared';
import { canKeepStock, canManageIntegrations, kgToUnit, shortSupply, weighNet, WEIGH_SHORT_TOLERANCE_KG, WEIGH_SHORT_TOLERANCE_PCT } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useProjects, useReceivableOrders, useWeighbridge, useWeighTicket, type WeightInput } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { formatDateTime, formatQty, formatTime } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag } from '@/components/common/AppTag';
import { LinkButton } from '@/components/common/LinkButton';
import { Section } from '@/components/common/Section';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, QuantityInput } from '@/components/form/inputs';
import { MoreOutlined, PlusOutlined } from '@/components/common/icons';
import { ReceiptModal } from './ReceiptModal';
import { StockEntryDrawer } from './StockEntryDrawer';

const small = { fontSize: themeFontSize('fontSizeSM') };
const kg = (v: string | number | null) =>
  v === null ? (
    <span className="text-muted">-</span>
  ) : (
    <span className="mono" translate="no">
      {formatQty(v)} kg
    </span>
  );

/** A net weight against its challan, as a tag: short beyond the allowance, within it, or nothing to check. */
export function shortTag(s: ShortCheck | null, unit: string | null): React.ReactNode {
  if (!s) return <span className="text-muted">No challan quantity</span>;
  const inUnit = (k: number) => `${formatQty(kgToUnit(Math.abs(k), unit) ?? k)} ${unit ?? 'kg'}`;
  if (s.short) return <AppTag tone="danger">{`${inUnit(s.shortKg)} short (${s.shortPct}%)`}</AppTag>;
  return <AppTag tone="success">{s.shortKg < 0 ? `${inUnit(s.shortKg)} over the challan` : 'Matches the challan'}</AppTag>;
}

const truck = (t: WeighTicketDto) => (
  <div>
    <span className="mono" style={{ fontWeight: 600 }} translate="no">
      {t.ticketNo}
    </span>
    <div className="text-muted" style={small} translate="no">
      {t.vehicleNo}
    </div>
  </div>
);

const order = (t: WeighTicketDto) =>
  t.poNo ? (
    <div>
      <span translate="no">{t.itemName ?? t.poNo}</span>
      <div className="text-muted" style={small} translate="no">
        {[t.poNo, t.vendorName, t.challanNo ? `challan ${t.challanNo}` : null].filter(Boolean).join(' · ')}
      </div>
    </div>
  ) : (
    <span className="text-muted">No order yet</span>
  );

const weighingLabel = (w: WeighingDto) => `${formatQty(w.weightKg)} kg at ${formatTime(w.at)}${w.stableSeconds !== null ? `, held ${w.stableSeconds} s` : ''}`;

type Opened =
  | { kind: 'new'; weighing?: WeighingDto }
  | { kind: 'edit'; ticket: WeighTicketDto }
  | { kind: 'second'; ticket: WeighTicketDto; weighing?: WeighingDto }
  | { kind: 'cancel'; ticket: WeighTicketDto }
  | { kind: 'grn'; ticket: WeighTicketDto };

/**
 * Stock › Weighbridge (ARCHITECTURE "Weighbridge"): the weights the site's weighbridge took that are on no
 * ticket yet, the trucks waiting for their second weight, the weighed loads whose GRN is to make (at the net weight,
 * checked against the challan) and the week's done. Weights can be typed where no Connector reads the bridge.
 */
export function Weighbridge({ projectId }: { projectId?: string }) {
  const { user } = useAuth();
  const [scoped] = useProjectScope();
  const project = projectId ?? scoped;
  const { data, isLoading, error, refetch } = useWeighbridge(project);
  const keeper = !!user && canKeepStock(user.roleKey);
  const admin = !!user && canManageIntegrations(user.roleKey);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [grn, setGrn] = useState<string | null>(null);

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const weighButton = keeper ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpened({ kind: 'new' })}>
      Weigh a truck
    </Button>
  ) : null;
  const nothing = !data.weighings.length && !data.open.length && !data.weighed.length && !data.done.length;

  const weighingColumns: TableProps<WeighingDto>['columns'] = [
    {
      title: 'Time',
      dataIndex: 'at',
      width: 150,
      render: (v: string) => formatDateTime(v),
    },
    {
      title: 'Weight',
      dataIndex: 'weightKg',
      width: 130,
      align: 'right',
      render: (v: string) => kg(v),
    },
    {
      title: 'Weighbridge',
      dataIndex: 'connectionName',
      render: (v: string, w) => `${v}${w.stableSeconds !== null ? `, held ${w.stableSeconds} s` : ''}`,
    },
    ...(keeper
      ? [
          {
            title: 'Put it on',
            key: 'use',
            width: 260,
            render: (_: unknown, w: WeighingDto) => {
              const waiting = data.open.filter((t) => t.projectId === w.projectId && new Date(t.first.at) < new Date(w.at));
              return (
                <Space size={8} wrap>
                  <Button size="small" onClick={() => setOpened({ kind: 'new', weighing: w })} aria-label={`New ticket from ${formatQty(w.weightKg)} kg at ${formatTime(w.at)}`}>
                    New ticket
                  </Button>
                  {waiting.length ? (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: waiting.map((t) => ({
                          key: t.id,
                          label: `${t.ticketNo} · ${t.vehicleNo} · first ${formatQty(t.first.kg)} kg`,
                        })),
                        onClick: ({ key }) =>
                          setOpened({
                            kind: 'second',
                            ticket: waiting.find((t) => t.id === key)!,
                            weighing: w,
                          }),
                      }}
                    >
                      <Button size="small" aria-label={`Use ${formatQty(w.weightKg)} kg at ${formatTime(w.at)} as a second weight`}>
                        Second weight of…
                      </Button>
                    </Dropdown>
                  ) : null}
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  const menu = (t: WeighTicketDto) =>
    keeper ? (
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'edit', label: 'Change truck, order or challan' },
            { key: 'cancel', label: 'Cancel the ticket', danger: true },
          ],
          onClick: ({ key }) => setOpened(key === 'edit' ? { kind: 'edit', ticket: t } : { kind: 'cancel', ticket: t }),
        }}
      >
        <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More for ${t.ticketNo}`} />
      </Dropdown>
    ) : null;

  const weight = (w: WeighTicketDto['first'] | null) =>
    w ? (
      <div>
        {kg(w.kg)}
        <div className="text-muted" style={small}>
          {formatTime(w.at)}
          {w.typed ? ', typed' : ''}
        </div>
      </div>
    ) : (
      <span className="text-muted">-</span>
    );

  const openColumns: TableProps<WeighTicketDto>['columns'] = [
    { title: 'Ticket', key: 'ticket', width: 150, render: (_, t) => truck(t) },
    { title: 'Brings', key: 'order', render: (_, t) => order(t) },
    {
      title: 'First weight',
      key: 'first',
      width: 130,
      align: 'right',
      render: (_, t) => weight(t.first),
    },
    ...(keeper
      ? [
          {
            title: '',
            key: 'act',
            width: 190,
            render: (_: unknown, t: WeighTicketDto) => (
              <Space size={4}>
                <Button size="small" onClick={() => setOpened({ kind: 'second', ticket: t })}>
                  Second weight
                </Button>
                {menu(t)}
              </Space>
            ),
          },
        ]
      : []),
  ];

  const netCell = (t: WeighTicketDto) => (
    <div>
      {kg(t.netKg)}
      <div className="text-muted" style={small} translate="no">
        {t.netQty !== null && t.unit ? `${formatQty(t.netQty)} ${t.unit}, ` : ''}
        {`${formatQty(t.grossKg)} less ${formatQty(t.tareKg)}`}
      </div>
    </div>
  );

  const weighedColumns: TableProps<WeighTicketDto>['columns'] = [
    { title: 'Ticket', key: 'ticket', width: 150, render: (_, t) => truck(t) },
    { title: 'Brings', key: 'order', render: (_, t) => order(t) },
    {
      title: 'Net weight',
      key: 'net',
      width: 190,
      align: 'right',
      render: (_, t) => netCell(t),
    },
    {
      title: 'Challan',
      key: 'challan',
      width: 120,
      align: 'right',
      render: (_, t) => (t.challanQty !== null ? <span className="mono" translate="no">{`${formatQty(t.challanQty)} ${t.unit ?? ''}`}</span> : <span className="text-muted">-</span>),
    },
    {
      title: 'Check',
      key: 'check',
      width: 210,
      render: (_, t) => shortTag(t.short, t.unit),
    },
    ...(keeper
      ? [
          {
            title: '',
            key: 'act',
            width: 180,
            render: (_: unknown, t: WeighTicketDto) => (
              <Space size={4}>
                {t.purchaseOrderId && t.purchaseOrderLineId ? (
                  <Button size="small" type="primary" onClick={() => setOpened({ kind: 'grn', ticket: t })} aria-label={`Make the GRN for ${t.ticketNo}`}>
                    Make the GRN
                  </Button>
                ) : (
                  <Button size="small" onClick={() => setOpened({ kind: 'edit', ticket: t })} aria-label={`Add the order to ${t.ticketNo}`}>
                    Add the order
                  </Button>
                )}
                {menu(t)}
              </Space>
            ),
          },
        ]
      : []),
  ];

  const doneColumns: TableProps<WeighTicketDto>['columns'] = [
    { title: 'Ticket', key: 'ticket', width: 150, render: (_, t) => truck(t) },
    { title: 'Brings', key: 'order', render: (_, t) => order(t) },
    {
      title: 'Net weight',
      key: 'net',
      width: 190,
      align: 'right',
      render: (_, t) => (t.netKg !== null ? netCell(t) : <span className="text-muted">-</span>),
    },
    {
      title: 'GRN',
      key: 'grn',
      width: 280,
      render: (_, t) =>
        t.state === 'CANCELLED' ? (
          <span className="text-muted">{`Cancelled: ${t.cancelReason ?? ''}`}</span>
        ) : (
          <Space size={4} wrap>
            <Button size="small" type="link" style={{ paddingInline: 0 }} onClick={() => setGrn(t.stockEntryId)}>
              <span translate="no">{t.grnNo}</span>
            </Button>
            {t.grnAboveNetKg !== null ? <AppTag tone="danger">{`GRN ${formatQty(t.grnQty)} ${t.unit}, above the net weight`}</AppTag> : shortTag(t.short, t.unit)}
          </Space>
        ),
    },
  ];

  return (
    <>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary" style={small}>
          {data.bridges
            ? `${data.bridges} weighbridge${data.bridges === 1 ? '' : 's'} read by the Connector. Weights come in within a minute.`
            : 'No weighbridge is connected: type each truck’s weights from the indicator.'}{' '}
          {!data.bridges && admin ? (
            <LinkButton size="small" type="link" href="/connections" style={{ paddingInline: 0 }}>
              Connect the weighbridge
            </LinkButton>
          ) : null}
        </Typography.Text>
        {weighButton}
      </Flex>
      {nothing ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No trucks weighed in the last month" style={{ margin: '32px 0' }} /> : null}
      {data.weighings.length ? (
        <Section title="On the bridge, on no ticket yet">
          <Table<WeighingDto> rowKey="id" size="small" pagination={false} dataSource={data.weighings} scroll={{ x: 700 }} columns={weighingColumns} />
        </Section>
      ) : null}
      {data.open.length ? (
        <Section style={{ marginTop: 16 }} title="Waiting for the second weight">
          <Table<WeighTicketDto> rowKey="id" size="small" pagination={false} dataSource={data.open} scroll={{ x: 700 }} columns={openColumns} />
        </Section>
      ) : null}
      {data.weighed.length ? (
        <Section style={{ marginTop: 16 }} title="Weighed, GRN to make">
          <Table<WeighTicketDto> rowKey="id" size="small" pagination={false} dataSource={data.weighed} scroll={{ x: 1000 }} columns={weighedColumns} />
          <Typography.Paragraph type="secondary" style={{ ...small, marginTop: 8, marginBottom: 0 }}>
            {`The GRN is drafted at the net weight. A load is short when it weighs less than its challan by more than ${WEIGH_SHORT_TOLERANCE_PCT}% or ${WEIGH_SHORT_TOLERANCE_KG} kg, whichever is more.`}
          </Typography.Paragraph>
        </Section>
      ) : null}
      {data.done.length ? (
        <Section style={{ marginTop: 16 }} title="Done this week">
          <Table<WeighTicketDto> rowKey="id" size="small" pagination={false} dataSource={data.done} scroll={{ x: 800 }} columns={doneColumns} />
        </Section>
      ) : null}

      {opened?.kind === 'new' || opened?.kind === 'edit' ? (
        <TicketForm
          open
          onClose={() => setOpened(null)}
          projectId={opened.kind === 'edit' ? opened.ticket.projectId : (opened.weighing?.projectId ?? project)}
          lockProject={!!projectId || opened.kind === 'edit' || !!opened.weighing}
          ticket={opened.kind === 'edit' ? opened.ticket : undefined}
          weighing={opened.kind === 'new' ? opened.weighing : undefined}
          weighings={data.weighings}
        />
      ) : null}
      {opened?.kind === 'second' ? <SecondWeightForm open onClose={() => setOpened(null)} ticket={opened.ticket} weighing={opened.weighing} weighings={data.weighings} /> : null}
      {opened?.kind === 'cancel' ? <CancelForm open onClose={() => setOpened(null)} ticket={opened.ticket} /> : null}
      {opened?.kind === 'grn' ? (
        <ReceiptModal open onClose={() => setOpened(null)} projectId={opened.ticket.projectId} purchaseOrderId={opened.ticket.purchaseOrderId!} weighTicket={opened.ticket} />
      ) : null}
      <StockEntryDrawer id={grn} onClose={() => setGrn(null)} />
    </>
  );
}

interface TicketValues {
  projectId?: string;
  vehicleNo: string;
  purchaseOrderId?: string;
  purchaseOrderLineId?: string;
  challanNo?: string;
  challanQty?: number | null;
  remarks?: string;
  from: 'BRIDGE' | 'TYPED';
  weighingId?: string;
  weightKg?: number | null;
}

/** A truck's ticket: new from its first weight (the bridge's or typed), or its truck, order and challan changed. */
function TicketForm({
  open,
  onClose,
  projectId,
  lockProject,
  ticket,
  weighing,
  weighings,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  lockProject: boolean;
  ticket?: WeighTicketDto;
  weighing?: WeighingDto;
  weighings: WeighingDto[];
}) {
  const [form] = Form.useForm<TicketValues>();
  const { message } = App.useApp();
  const { create, update } = useWeighTicket();
  const { data: projects } = useProjects();
  const watchedProject = Form.useWatch('projectId', form) ?? projectId;
  const poId = Form.useWatch('purchaseOrderId', form);
  const lineId = Form.useWatch('purchaseOrderLineId', form);
  const from = Form.useWatch('from', form);
  const orders = useReceivableOrders(watchedProject, open && !!watchedProject);
  const po = orders.data?.find((o) => o.id === poId);
  const line = po?.lines.find((l) => l.purchaseOrderLineId === lineId);
  const onBridge = weighings.filter((w) => !watchedProject || w.projectId === watchedProject);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      ticket
        ? {
            projectId: ticket.projectId,
            vehicleNo: ticket.vehicleNo,
            purchaseOrderId: ticket.purchaseOrderId ?? undefined,
            purchaseOrderLineId: ticket.purchaseOrderLineId ?? undefined,
            challanNo: ticket.challanNo ?? undefined,
            challanQty: ticket.challanQty === null ? null : Number(ticket.challanQty),
            remarks: ticket.remarks ?? undefined,
          }
        : {
            projectId,
            from: weighing || onBridge.length ? 'BRIDGE' : 'TYPED',
            weighingId: weighing?.id,
          },
    );
    // Only when the form opens: the bridge's list moving on must not reset what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket, weighing, form]);

  // An order with one line names it.
  useEffect(() => {
    if (po && po.lines.length === 1 && lineId !== po.lines[0].purchaseOrderLineId) form.setFieldValue('purchaseOrderLineId', po.lines[0].purchaseOrderLineId);
  }, [po, lineId, form]);

  const submit = async (v: TicketValues) => {
    const details = {
      purchaseOrderId: v.purchaseOrderId ?? null,
      purchaseOrderLineId: v.purchaseOrderLineId ?? null,
      challanNo: v.challanNo?.trim() || null,
      challanQty: v.challanQty === null || v.challanQty === undefined ? null : String(v.challanQty),
      remarks: v.remarks?.trim() || null,
    };
    if (ticket) {
      const t = await update.mutateAsync({
        id: ticket.id,
        vehicleNo: v.vehicleNo.trim(),
        ...details,
      });
      message.success(`${t.ticketNo} saved`);
      return;
    }
    const first: WeightInput = v.from === 'BRIDGE' ? { weighingId: v.weighingId! } : { weightKg: v.weightKg! };
    const t = await create.mutateAsync({
      projectId: v.projectId!,
      vehicleNo: v.vehicleNo.trim(),
      first,
      ...details,
    });
    message.success(`${t.ticketNo}: ${t.vehicleNo}, first weight ${formatQty(t.first.kg)} kg`);
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title={ticket ? `Ticket ${ticket.ticketNo}` : 'Weigh a truck'}
      okText={ticket ? 'Save ticket' : 'Make the ticket'}
      onSubmit={submit}
    >
      <Form form={form} layout="vertical">
        {lockProject ? (
          <Form.Item name="projectId" hidden>
            <Input />
          </Form.Item>
        ) : (
          <Form.Item name="projectId" label="Site" rules={[{ required: true, message: 'Choose the site the truck is at' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Choose the site"
              onChange={() =>
                form.setFieldsValue({
                  purchaseOrderId: undefined,
                  purchaseOrderLineId: undefined,
                  weighingId: undefined,
                })
              }
              options={(projects ?? []).map((p) => ({
                value: p.id,
                label: `${p.code} - ${p.name}`,
              }))}
            />
          </Form.Item>
        )}
        <FormGrid cols={2}>
          <Form.Item
            name="vehicleNo"
            label="Truck number"
            rules={[
              {
                required: true,
                min: 3,
                message: "Type the truck's number, e.g. OD 02 AB 1234",
              },
            ]}
          >
            <Input maxLength={30} placeholder="OD 02 AB 1234" {...CODE_INPUT} />
          </Form.Item>
          <Form.Item name="challanNo" label="Challan no.">
            <Input maxLength={60} {...CODE_INPUT} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="purchaseOrderId" label="Purchase order" extra="The GRN is drafted against it at the net weight. It can be added after weighing too.">
          <Select
            allowClear
            showSearch={{ optionFilterProp: 'label' }}
            loading={orders.isLoading}
            placeholder={watchedProject ? 'Choose the order the truck brings' : 'Choose the site first'}
            disabled={!watchedProject}
            onChange={() => form.setFieldValue('purchaseOrderLineId', undefined)}
            options={(orders.data ?? []).map((o) => ({
              value: o.id,
              label: `${o.poNo} · ${o.vendorName} · ${o.lines.map((l) => l.itemName).join(', ')}`,
            }))}
          />
        </Form.Item>
        <FormGrid cols={2}>
          {po && po.lines.length > 1 ? (
            <Form.Item name="purchaseOrderLineId" label="Item" rules={[{ required: true, message: 'Choose the item on the truck' }]}>
              <Select
                options={po.lines.map((l) => ({
                  value: l.purchaseOrderLineId,
                  label: `${l.itemName} (${formatQty(l.pending)} ${l.unit} to come)`,
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item name="purchaseOrderLineId" hidden>
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="challanQty"
            label="Quantity on the challan"
            extra={line && kgToUnit(1000, line.unit) === null ? `${line.unit} is not a weight, so the load is not checked against it` : undefined}
          >
            <QuantityInput unit={line?.unit ?? null} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        {ticket ? null : (
          <>
            <Form.Item name="from" label="First weight">
              <Radio.Group
                options={[
                  {
                    value: 'BRIDGE',
                    label: 'From the bridge',
                    disabled: !onBridge.length,
                  },
                  { value: 'TYPED', label: 'Type it' },
                ]}
              />
            </Form.Item>
            {from === 'BRIDGE' ? (
              <Form.Item name="weighingId" label="Weight on the bridge" rules={[{ required: true, message: 'Pick the weight the truck made' }]}>
                <Select
                  placeholder="Pick the truck's weight"
                  options={onBridge.map((w) => ({
                    value: w.id,
                    label: weighingLabel(w),
                  }))}
                />
              </Form.Item>
            ) : (
              <Form.Item
                name="weightKg"
                label="Weight (kg)"
                rules={[
                  {
                    required: true,
                    message: 'Type the weight the indicator shows',
                  },
                ]}
                extra="A typed weight is marked as typed on the ticket and the GRN."
              >
                <InputNumber<number> min={200} max={150000} precision={0} controls={false} inputMode="numeric" suffix="kg" style={{ width: '100%' }} />
              </Form.Item>
            )}
          </>
        )}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The truck back on the bridge: its second weight, with the net weight and the challan check as it will be saved. */
function SecondWeightForm({ open, onClose, ticket, weighing, weighings }: { open: boolean; onClose: () => void; ticket: WeighTicketDto; weighing?: WeighingDto; weighings: WeighingDto[] }) {
  const [form] = Form.useForm<{
    from: 'BRIDGE' | 'TYPED';
    weighingId?: string;
    weightKg?: number | null;
  }>();
  const { message } = App.useApp();
  const { second } = useWeighTicket();
  const onBridge = useMemo(() => weighings.filter((w) => w.projectId === ticket.projectId && new Date(w.at) > new Date(ticket.first.at)), [weighings, ticket]);
  const from = Form.useWatch('from', form);
  const weighingId = Form.useWatch('weighingId', form);
  const typed = Form.useWatch('weightKg', form);
  const kgNow = from === 'BRIDGE' ? Number(onBridge.find((w) => w.id === weighingId)?.weightKg ?? NaN) : typeof typed === 'number' ? typed : NaN;
  const net = Number.isFinite(kgNow) ? weighNet(Number(ticket.first.kg), kgNow) : null;
  const check = net ? shortSupply(net.netKg, ticket.challanQty === null ? null : Number(ticket.challanQty), ticket.unit) : null;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      from: weighing || onBridge.length ? 'BRIDGE' : 'TYPED',
      weighingId: weighing?.id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weighing, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      title={`Second weight of ${ticket.ticketNo}`}
      okText="Save the weight"
      footerExtra={
        net ? (
          <span translate="no">
            {`Net ${formatQty(net.netKg)} kg${ticket.unit && kgToUnit(net.netKg, ticket.unit) !== null ? ` (${formatQty(kgToUnit(net.netKg, ticket.unit))} ${ticket.unit})` : ''}`}
          </span>
        ) : undefined
      }
      onSubmit={async (v) => {
        const t = await second.mutateAsync({
          id: ticket.id,
          ...(v.from === 'BRIDGE' ? { weighingId: v.weighingId! } : { weightKg: v.weightKg! }),
        });
        message.success(`${t.ticketNo}: net ${formatQty(t.netKg)} kg`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary" style={small}>
          {`${ticket.vehicleNo}, first weight ${formatQty(ticket.first.kg)} kg at ${formatTime(ticket.first.at)}${ticket.first.typed ? ' (typed)' : ''}.`}
        </Typography.Paragraph>
        <Form.Item name="from" label="Second weight">
          <Radio.Group
            options={[
              {
                value: 'BRIDGE',
                label: 'From the bridge',
                disabled: !onBridge.length,
              },
              { value: 'TYPED', label: 'Type it' },
            ]}
          />
        </Form.Item>
        {from === 'BRIDGE' ? (
          <Form.Item
            name="weighingId"
            label="Weight on the bridge"
            rules={[
              {
                required: true,
                message: 'Pick the weight the truck made on the way out',
              },
            ]}
          >
            <Select
              placeholder="Pick the truck's weight"
              options={onBridge.map((w) => ({
                value: w.id,
                label: weighingLabel(w),
              }))}
            />
          </Form.Item>
        ) : (
          <Form.Item
            name="weightKg"
            label="Weight (kg)"
            rules={[
              {
                required: true,
                message: 'Type the weight the indicator shows',
              },
            ]}
          >
            <InputNumber<number> min={200} max={150000} precision={0} controls={false} inputMode="numeric" suffix="kg" style={{ width: '100%' }} />
          </Form.Item>
        )}
        {net ? <div>{shortTag(check, ticket.unit)}</div> : null}
      </Form>
    </FormShell>
  );
}

/** A truck that turned back: the ticket is cancelled with the reason, and its weights go back on the list. */
function CancelForm({ open, onClose, ticket }: { open: boolean; onClose: () => void; ticket: WeighTicketDto }) {
  const [form] = Form.useForm<{ reason: string }>();
  const { message } = App.useApp();
  const { cancel } = useWeighTicket();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={480}
      title={`Cancel ${ticket.ticketNo}`}
      okText="Cancel the ticket"
      onSubmit={async (v) => {
        await cancel.mutateAsync({ id: ticket.id, reason: v.reason.trim() });
        message.success(`${ticket.ticketNo} cancelled`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="reason"
          label="Why"
          rules={[
            {
              required: true,
              min: 3,
              message: 'Say why the ticket is cancelled, e.g. the truck turned back',
            },
          ]}
        >
          <Input.TextArea rows={2} maxLength={300} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
