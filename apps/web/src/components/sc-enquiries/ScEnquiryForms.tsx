'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Form, Input, InputNumber, Radio, Select, Table, Typography, theme } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { GST_RATES, SC_ENQUIRY_STATUS_LABELS, rankLabel, type ScEnquiryDetailDto, type ScEnquiryStatus, type ScQuoteDto } from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useBoq, useProjects, useScEnquiryAction, useVendorsPage } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { afterFormLeaves, FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { UnitInput } from '@/components/common/UnitInput';

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);
const notAfterToday = (d: dayjs.Dayjs) => d.isAfter(dayjs(), 'day');
/** Subcontractors and labour contractors, who are asked to quote. */
const SUB_KINDS = 'SUBCONTRACTOR,LABOUR_CONTRACTOR';

const STATUS_COLORS: Record<ScEnquiryStatus, string | undefined> = { OPEN: 'processing', AWARDED: 'success', CANCELLED: undefined };
export function ScEnquiryStatusTag({ status }: { status: ScEnquiryStatus }) {
  return <AppTag color={STATUS_COLORS[status]}>{SC_ENQUIRY_STATUS_LABELS[status]}</AppTag>;
}

/** The subcontractors on the vendor master, for asking to quote. */
function useSubcontractorOptions(enabled: boolean, exclude: string[] = []) {
  const { data, isLoading } = useVendorsPage({ kinds: SUB_KINDS, pageSize: 200, sortBy: 'name', sortOrder: 'asc' }, enabled);
  const skip = new Set(exclude);
  return { loading: isLoading, options: (data?.items ?? []).filter((v) => !skip.has(v.id)).map((v) => ({ value: v.id, label: v.name })) };
}

interface ItemValue {
  boqItemId?: string | null;
  description?: string;
  unit?: string;
  quantity?: number | null;
}
interface EnquiryValues {
  projectId: string;
  title: string;
  closesOn?: dayjs.Dayjs | null;
  scope?: string;
  items: ItemValue[];
  vendorIds?: string[];
}

/**
 * A new enquiry or a change to one: the work, the last day to quote, what the rates must include, the items to price (BOQ
 * items of the project at the quantity given out, or the enquiry's own) and, when new, who is asked. The items lock once
 * a quote is in.
 */
export function ScEnquiryForm({ open, enquiry, onClose, onSaved }: { open: boolean; enquiry?: ScEnquiryDetailDto | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const [form] = Form.useForm<EnquiryValues>();
  const { token } = theme.useToken();
  const act = useScEnquiryAction<{ id: string; enquiryNo: string }>();
  const notify = useNotify();
  const saved = useRef<string | null>(null);
  const { data: projects } = useProjects();
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const { data: boq } = useBoq(open ? projectId : undefined);
  const items = Form.useWatch('items', { form, preserve: true }) as ItemValue[] | undefined;
  const subs = useSubcontractorOptions(open && !enquiry);
  const itemsFixed = !!enquiry && enquiry.received > 0;
  const boqById = useMemo(() => new Map((boq ?? []).map((b) => [b.id, b])), [boq]);
  const used = new Set((items ?? []).map((i) => i.boqItemId).filter(Boolean));

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (enquiry)
      form.setFieldsValue({
        projectId: enquiry.projectId,
        title: enquiry.title,
        closesOn: enquiry.closesOn ? dayjs(enquiry.closesOn) : null,
        scope: enquiry.scope ?? undefined,
        items: enquiry.items.map((i) => ({ boqItemId: i.boqItemId, description: i.description, unit: i.unit, quantity: toNumber(i.quantity) })),
      });
    else form.setFieldsValue({ closesOn: dayjs().add(7, 'day'), items: [{}], vendorIds: [] });
  }, [open, enquiry, form]);

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={980}
      title={enquiry ? `Edit ${enquiry.enquiryNo}` : 'New subcontract enquiry'}
      okText="Save enquiry"
      allValues
      draftKey={enquiry ? undefined : 'sc-enquiry:new'}
      onSubmit={async (v) => {
        const body = {
          title: v.title.trim(),
          closesOn: ymd(v.closesOn),
          scope: v.scope?.trim() || null,
          ...(itemsFixed
            ? {}
            : {
                items: v.items.map((i) =>
                  i.boqItemId ? { boqItemId: i.boqItemId, quantity: String(i.quantity) } : { description: i.description?.trim(), unit: i.unit?.trim(), quantity: String(i.quantity) },
                ),
              }),
        };
        const row = enquiry
          ? await act.mutateAsync({ method: 'patch', path: `/subcontract-enquiries/${enquiry.id}`, body })
          : await act.mutateAsync({ path: '/subcontract-enquiries', body: { ...body, projectId: v.projectId, vendorIds: v.vendorIds ?? [] } });
        saved.current = row.id;
        notify.saved(enquiry ? `${enquiry.enquiryNo} saved` : `Enquiry ${row.enquiryNo} created`);
        if (!enquiry && onSaved) afterFormLeaves(() => saved.current && onSaved(saved.current));
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="The work">
          <FormGrid cols={2}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                disabled={!!enquiry}
                onChange={() => form.setFieldValue('items', [{}])}
                options={(projects ?? []).filter((p) => p.type !== 'STORE').map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              />
            </Form.Item>
            <Form.Item name="closesOn" label="Last day to quote">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGrid>
          <Form.Item name="title" label="Work" rules={[{ required: true, whitespace: true, message: 'Say what the work is' }]}>
            <Input maxLength={200} placeholder="Brickwork and plaster, Block A" />
          </Form.Item>
          <Form.Item name="scope" label="What the rates include" extra="Sent with the enquiry, and the terms of the work order it becomes.">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={4000} placeholder="Rates include labour, scaffolding and curing; cement and steel issued free from our store." />
          </Form.Item>
        </FormSection>
        <FormSection title="Items to price">
          {itemsFixed ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: token.margin }}
              title="Quotes are in against these items, so they stay as they are. Start a new enquiry to ask for different items."
            />
          ) : (
            <LineTable
              name="items"
              label="Item"
              min={1}
              addText="Add item"
              newLine={() => ({})}
              columns={[
                {
                  key: 'boq',
                  title: 'BOQ item',
                  width: 240,
                  render: (f) => (
                    <Form.Item name={[f.name, 'boqItemId']} noStyle>
                      <Select
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder={projectId ? 'Own item' : 'Choose the project first'}
                        disabled={!projectId}
                        style={{ width: '100%' }}
                        aria-label={`BOQ item of line ${f.name + 1}`}
                        popupMatchSelectWidth={440}
                        options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} ${b.description}`, disabled: used.has(b.id) && items?.[f.name]?.boqItemId !== b.id }))}
                        onChange={(id: string | undefined) => {
                          const b = id ? boqById.get(id) : undefined;
                          form.setFieldValue(['items', f.name], { ...items?.[f.name], boqItemId: id ?? null, unit: b?.unit ?? items?.[f.name]?.unit, quantity: items?.[f.name]?.quantity ?? (b ? toNumber(b.revisedQty ?? b.originalQty) : null) });
                        }}
                      />
                    </Form.Item>
                  ),
                },
                {
                  key: 'desc',
                  title: 'Description',
                  render: (f) => {
                    const b = items?.[f.name]?.boqItemId ? boqById.get(items[f.name].boqItemId!) : undefined;
                    return b ? (
                      <Typography.Text style={{ fontSize: token.fontSizeSM }}>{b.description}</Typography.Text>
                    ) : (
                      <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Describe the item' }]}>
                        <Input placeholder="Scaffolding, hire and erection" aria-label={`Description of line ${f.name + 1}`} maxLength={300} />
                      </Form.Item>
                    );
                  },
                },
                {
                  key: 'unit',
                  title: 'Unit',
                  width: 90,
                  render: (f) =>
                    items?.[f.name]?.boqItemId ? (
                      boqById.get(items[f.name].boqItemId!)?.unit
                    ) : (
                      <Form.Item name={[f.name, 'unit']} noStyle rules={[{ required: true, whitespace: true, message: 'Enter the unit' }]}>
                        <UnitInput aria-label={`Unit of line ${f.name + 1}`} maxLength={30} />
                      </Form.Item>
                    ),
                },
                {
                  key: 'qty',
                  title: 'Quantity',
                  width: 150,
                  render: (f) => {
                    const b = items?.[f.name]?.boqItemId ? boqById.get(items[f.name].boqItemId!) : undefined;
                    return (
                      <>
                        <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                          <QuantityInput min={0.001} aria-label={`Quantity of line ${f.name + 1}`} />
                        </Form.Item>
                        {b ? (
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                            {`BOQ ${toNumber(b.revisedQty ?? b.originalQty).toLocaleString('en-IN')}`}
                          </Typography.Text>
                        ) : null}
                      </>
                    );
                  },
                },
              ]}
            />
          )}
        </FormSection>
        {enquiry ? null : (
          <FormSection title="Ask to quote">
            <Form.Item name="vendorIds" label="Subcontractors" extra="Add more later from the enquiry.">
              <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} loading={subs.loading} options={subs.options} placeholder="Choose subcontractors" maxCount={20} />
            </Form.Item>
          </FormSection>
        )}
      </Form>
    </FormShell>
  );
}

/** Ask more subcontractors to quote. */
export function InviteDialog({ enquiry, open, onClose }: { enquiry: ScEnquiryDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ vendorIds: string[] }>();
  const act = useScEnquiryAction();
  const notify = useNotify();
  const subs = useSubcontractorOptions(open, enquiry.quotes.map((q) => q.vendorId));
  useEffect(() => {
    if (open) form.setFieldsValue({ vendorIds: [] });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Ask to quote · ${enquiry.enquiryNo}`}
      okText="Add"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/subcontract-enquiries/${enquiry.id}/quotes`, body: { vendorIds: v.vendorIds } });
        notify.saved(v.vendorIds.length === 1 ? 'Subcontractor added' : `${v.vendorIds.length} subcontractors added`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="vendorIds" label="Subcontractors" rules={[{ required: true, message: 'Choose the subcontractors' }]} extra="Subcontractors and labour contractors on the vendor master who are not asked yet.">
          <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} loading={subs.loading} options={subs.options} placeholder="Choose subcontractors" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface QuoteValues {
  receivedOn: dayjs.Dayjs;
  gstRate: number;
  validUntil?: dayjs.Dayjs | null;
  note?: string;
  rates: { itemId: string; rate?: number | null }[];
}

/** A subcontractor's quote as it came: their rate for each item (left empty where they did not quote it), GST and validity. */
export function QuoteDrawer({ enquiry, quote, onClose }: { enquiry: ScEnquiryDetailDto; quote: ScQuoteDto | null; onClose: () => void }) {
  const [form] = Form.useForm<QuoteValues>();
  const { token } = theme.useToken();
  const act = useScEnquiryAction();
  const notify = useNotify();
  const rates = Form.useWatch('rates', { form, preserve: true }) as QuoteValues['rates'] | undefined;
  const gstRate = Form.useWatch('gstRate', form) as number | undefined;
  const open = !!quote;

  useEffect(() => {
    if (!quote) return;
    form.resetFields();
    form.setFieldsValue({
      receivedOn: quote.receivedOn ? dayjs(quote.receivedOn) : dayjs(),
      gstRate: toNumber(quote.gstRate) || 18,
      validUntil: quote.validUntil ? dayjs(quote.validUntil) : null,
      note: quote.note ?? undefined,
      rates: enquiry.items.map((i) => ({ itemId: i.id, rate: quote.rates[i.id] === null || quote.rates[i.id] === undefined ? null : toNumber(quote.rates[i.id]) })),
    });
  }, [quote, enquiry.items, form]);

  const amount = (n: number) => {
    const r = rates?.[n]?.rate;
    return r === null || r === undefined ? null : Math.round(toNumber(enquiry.items[n]?.quantity) * r * 100) / 100;
  };
  const total = enquiry.items.reduce((s, _, n) => s + (amount(n) ?? 0), 0);
  const priced = enquiry.items.filter((_, n) => amount(n) !== null).length;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={900}
      projectDefault={false}
      title={quote ? `${quote.received ? 'Edit quote' : 'Enter quote'} · ${quote.vendorName}` : ''}
      okText="Save quote"
      allValues
      onSubmit={async (v) => {
        await act.mutateAsync({
          method: 'put',
          path: `/subcontract-enquiries/${enquiry.id}/quotes/${quote!.id}`,
          body: {
            receivedOn: ymd(v.receivedOn),
            gstRate: String(v.gstRate ?? 0),
            validUntil: ymd(v.validUntil),
            note: v.note?.trim() || null,
            rates: v.rates.map((r) => ({ itemId: r.itemId, rate: r.rate === null || r.rate === undefined ? null : String(r.rate) })),
          },
        });
        notify.saved(`Quote from ${quote!.vendorName} saved`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={3}>
          <Form.Item name="receivedOn" label="Received on" rules={[{ required: true, message: 'Choose the day their quote came' }]}>
            <DatePicker disabledDate={notAfterToday} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="gstRate" label="GST on their bills">
            <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
          </Form.Item>
          <Form.Item name="validUntil" label="Valid until">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <LineTable
          name="rates"
          label="Item"
          locked
          columns={[
            {
              key: 'item',
              title: 'Item',
              render: (_, n) => {
                const it = enquiry.items[n];
                return it ? (
                  <div>
                    <span translate="no">{it.itemNo ? `${it.itemNo} ` : ''}</span>
                    {it.description}
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }} translate="no">
                      {`${toNumber(it.quantity).toLocaleString('en-IN')} ${it.unit}${it.clientRate ? ` · client ${formatINR(it.clientRate)}` : ''}`}
                    </Typography.Text>
                  </div>
                ) : null;
              },
            },
            {
              key: 'rate',
              title: 'Their rate',
              width: 170,
              render: (f, n) => (
                <Form.Item name={[f.name, 'rate']} noStyle>
                  <MoneyInput aria-label={`Rate for ${enquiry.items[n]?.description ?? `item ${n + 1}`}`} placeholder="Not quoted" />
                </Form.Item>
              ),
            },
            {
              key: 'amount',
              title: 'Amount',
              width: 150,
              align: 'right',
              render: (_, n) => <span className="mono" translate="no">{amount(n) === null ? '-' : formatINR(amount(n)!, true)}</span>,
            },
          ]}
          footer={() => (
            <>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right">
                  <strong>{priced === enquiry.items.length ? 'Total' : `Total of ${priced} of ${enquiry.items.length} items`}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <strong className="mono" translate="no">{formatINR(total, true)}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3} align="right">{`GST at ${toNumber(gstRate)}%`}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <span className="mono" translate="no">{formatINR(Math.round(total * toNumber(gstRate)) / 100, true)}</span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </>
          )}
        />
        <Form.Item name="note" label="Note" style={{ marginTop: token.margin }}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="Conditions they quoted with, e.g. can start after the monsoon" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

interface AwardValues {
  quoteId: string;
  note?: string;
  startDate?: dayjs.Dayjs | null;
  endDate?: dayjs.Dayjs | null;
  retentionPct?: number | null;
}

/**
 * Award a complete quote: it becomes a draft work order at the quote's rates and GST, with the enquiry's scope as its
 * terms, and the page moves to it. A quote that is not the lowest needs a reason.
 */
export function AwardDialog({ enquiry, open, quoteId, onClose }: { enquiry: ScEnquiryDetailDto; open: boolean; quoteId?: string | null; onClose: () => void }) {
  const [form] = Form.useForm<AwardValues>();
  const act = useScEnquiryAction<{ workOrderId: string; woNo: string }>();
  const notify = useNotify();
  const router = useRouter();
  const made = useRef<string | null>(null);
  const picked = Form.useWatch('quoteId', form) as string | undefined;
  const choices = enquiry.quotes.filter((q) => q.received && q.complete);
  const chosen = choices.find((q) => q.id === picked);
  const lowest = choices.find((q) => q.rank === 1);
  useEffect(() => {
    if (open) form.setFieldsValue({ quoteId: quoteId ?? lowest?.id, note: undefined, startDate: null, endDate: null, retentionPct: 5 });
  }, [open, quoteId, lowest?.id, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={600}
      projectDefault={false}
      title={`Award · ${enquiry.enquiryNo}`}
      okText="Award and make the work order"
      onSubmit={async (v) => {
        const r = await act.mutateAsync({
          path: `/subcontract-enquiries/${enquiry.id}/award`,
          body: { quoteId: v.quoteId, note: v.note?.trim() || null, startDate: ymd(v.startDate), endDate: ymd(v.endDate), retentionPct: String(v.retentionPct ?? 0) },
        });
        made.current = r.workOrderId;
        notify.saved(`Awarded: draft work order ${r.woNo} made`);
        afterFormLeaves(() => made.current && router.push(`/work-orders/${made.current}`));
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="quoteId" label="Quote" rules={[{ required: true, message: 'Choose the quote to award' }]}>
          <Radio.Group
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            options={choices.map((q) => ({
              value: q.id,
              label: (
                <span translate="no">
                  {`${rankLabel(q.rank ?? 0)} · ${q.vendorName} · ${formatINR(q.total, true)}`}
                  <Typography.Text type="secondary">{` + GST ${toNumber(q.gstRate)}%`}</Typography.Text>
                </span>
              ),
            }))}
          />
        </Form.Item>
        {chosen && chosen.rank !== 1 ? (
          <Form.Item
            name="note"
            label="Why this quote"
            rules={[{ required: true, whitespace: true, message: 'Say why this quote is chosen over the lowest' }]}
            extra={lowest ? <span translate="no">{`The lowest is ${lowest.vendorName} at ${formatINR(lowest.total, true)}.`}</span> : undefined}
          >
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="L1 has no crew free until March" />
          </Form.Item>
        ) : (
          <Form.Item name="note" label="Note">
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} />
          </Form.Item>
        )}
        <FormGrid cols={3}>
          <Form.Item name="startDate" label="Start">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endDate" label="Finish">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="retentionPct" label="Retention (%)">
            <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </FormGrid>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          The work order is made as a draft at the quote&apos;s rates and GST, with the enquiry&apos;s scope as its terms. Check its TDS, advance and payment days, then submit it for approval.
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}

/** Cancel an open enquiry, with the reason. */
export function CancelDialog({ enquiry, open, onClose }: { enquiry: ScEnquiryDetailDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const act = useScEnquiryAction();
  const notify = useNotify();
  useEffect(() => {
    if (open) form.setFieldsValue({ note: '' });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Cancel enquiry · ${enquiry.enquiryNo}`}
      okText="Cancel enquiry"
      onSubmit={async (v) => {
        await act.mutateAsync({ path: `/subcontract-enquiries/${enquiry.id}/status`, body: { status: 'CANCELLED', note: v.note.trim() } });
        notify.saved(`${enquiry.enquiryNo} cancelled`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="Why" rules={[{ required: true, whitespace: true, message: 'Say why the enquiry is cancelled' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} placeholder="Our own crew will do this work" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
