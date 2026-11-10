'use client';

import React, { useEffect, useState } from 'react';
import { HelpLink } from '@/components/common/Help';
import { App, Button, Form, Input, Select, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RaBillDto, RaBillHoldDto, RaBillHoldReleaseDto } from '@erp/shared';
import { EditOutlined } from '@/components/common/icons';
import { DatePicker } from '@/components/common/DatePicker';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useOpenHolds } from '@/lib/queries';
import { formatDate, formatMoney, toNumber } from '@/lib/format';
import { FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput } from '@/components/form/inputs';
import { Section } from '@/components/common/Section';
import { tk } from '@/ds';

export interface HoldLine {
  id?: string;
  description?: string;
  reason?: string;
  amount?: number | null;
}
interface ReleaseLine {
  holdId?: string;
  amount?: number | null;
  note?: string;
}
interface FormValues {
  holds: HoldLine[];
  releases: ReleaseLine[];
}

/** A bill's holds as form lines, to start the drawer or the certificate from. */
export const holdLinesOf = (bill: RaBillDto): HoldLine[] => bill.holds.map((h) => ({ id: h.id, description: h.description, reason: h.reason, amount: toNumber(h.amount) }));

/** The holds as the API takes them. */
export const holdsBody = (lines: HoldLine[] | undefined) =>
  (lines ?? []).filter((h) => h && (h.description?.trim() || h.amount)).map((h) => ({ ...(h.id ? { id: h.id } : {}), description: h.description?.trim() ?? '', reason: h.reason?.trim() ?? '', amount: String(h.amount ?? 0) }));

/** The amounts withheld for disputed items, as lines of a form (the drawer here and the certificate). */
export function HoldLines({ name = 'holds' }: { name?: string }) {
  return (
    <LineTable
      name={name}
      label="Withheld"
      newLine={() => ({})}
      addText="Add an amount withheld"
      columns={[
        {
          key: 'description',
          title: 'What is withheld',
          render: (f) => (
            <>
              <Form.Item name={[f.name, 'id']} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Say what is withheld' }]}>
                <Input maxLength={300} placeholder="Extra lead on earthwork, item 2.04" aria-label={`What is withheld, line ${f.name + 1}`} />
              </Form.Item>
            </>
          ),
        },
        {
          key: 'reason',
          title: 'Reason',
          render: (f) => (
            <Form.Item name={[f.name, 'reason']} noStyle rules={[{ required: true, whitespace: true, message: 'Give the reason the engineer withheld it' }]}>
              <Input maxLength={500} placeholder="Pending the SE's decision" aria-label={`Reason, line ${f.name + 1}`} />
            </Form.Item>
          ),
        },
        {
          key: 'amount',
          title: 'Amount',
          width: 150,
          render: (f) => (
            <Form.Item name={[f.name, 'amount']} noStyle rules={[{ required: true, message: 'Enter the amount withheld' }]}>
              <MoneyInput aria-label={`Amount withheld, line ${f.name + 1}`} />
            </Form.Item>
          ),
        },
      ]}
    />
  );
}

/**
 * Amounts withheld on a bill for disputed items and what it releases of earlier bills' holds. Set while the bill is not
 * approved (or on the certificate); once the client has certified the bill, a hold it will never pay is closed and lost.
 */
export function BillHolds({ bill, editable, preparer }: { bill: RaBillDto; editable: boolean; preparer: boolean }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState<RaBillHoldDto | null>(null);
  const certified = bill.status === 'APPROVED' && (bill.stage === 'CERTIFIED' || bill.stage === 'PAID');
  const m = (v: string | number) => (
    <span className="mono" translate="no">
      {formatMoney(v, bill, true)}
    </span>
  );

  return (
    <>
      {bill.holds.length ? (
        <Section title="Withheld on this bill">
          <Table<RaBillHoldDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={bill.holds}
            scroll={{ x: 720 }}
            columns={[
              {
                title: 'Item',
                render: (_, h) => (
                  <div>
                    {h.boqItemNo ? <span className="mono" translate="no">{h.boqItemNo} </span> : null}
                    {h.description}
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
                      {h.reason}
                    </Typography.Text>
                  </div>
                ),
              },
              { title: 'Withheld', dataIndex: 'amount', width: 130, align: 'right', render: (v) => m(v) },
              {
                title: 'Released',
                dataIndex: 'released',
                width: 130,
                align: 'right',
                render: (v, h) => (
                  <div>
                    {m(v)}
                    {h.releases.map((r) => (
                      <Typography.Text key={r.billId} type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>
                        {r.billLabel}
                      </Typography.Text>
                    ))}
                  </div>
                ),
              },
              {
                title: 'Still withheld',
                dataIndex: 'balance',
                width: 160,
                align: 'right',
                render: (v, h) =>
                  h.closedAt ? (
                    <Typography.Text type="secondary">
                      Closed {formatDate(h.closedAt)}, {formatMoney(h.lost, bill, true)} lost
                    </Typography.Text>
                  ) : (
                    <strong>{m(v)}</strong>
                  ),
              },
              ...(preparer && certified
                ? [
                    {
                      title: '',
                      key: 'close',
                      width: 80,
                      render: (_: unknown, h: RaBillHoldDto) =>
                        !h.closedAt && toNumber(h.balance) > 0 ? (
                          <Button size="small" type="link" onClick={() => setClosing(h)}>
                            Close
                          </Button>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        </Section>
      ) : null}
      {bill.releases.length ? (
        <Section title="Released on this bill">
          <Table<RaBillHoldReleaseDto>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={bill.releases}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Withheld on', dataIndex: 'holdBillLabel', width: 120 },
              { title: 'Item', render: (_, r) => <div>{r.description}{r.note ? <Typography.Text type="secondary" style={{ display: 'block', fontSize: tk.type.caption.fontSize }}>{r.note}</Typography.Text> : null}</div> },
              { title: 'Released', dataIndex: 'amount', width: 130, align: 'right', render: (v) => <strong>{m(v)}</strong> },
            ]}
          />
        </Section>
      ) : null}
      {!bill.holds.length && !bill.releases.length ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Nothing withheld or released on this bill.
        </Typography.Paragraph>
      ) : null}
      {editable ? (
        <Button size="small" icon={<EditOutlined />} style={{ marginTop: tk.space[2] }} onClick={() => setOpen(true)}>
          Change amounts withheld
        </Button>
      ) : null}
      {editable ? <HoldsDrawer open={open} bill={bill} onClose={() => setOpen(false)} /> : null}
      <CloseHoldModal hold={closing} bill={bill} onClose={() => setClosing(null)} />
    </>
  );
}

function HoldsDrawer({ open, bill, onClose }: { open: boolean; bill: RaBillDto; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: holds } = useOpenHolds(bill.projectId, open);
  // What each earlier hold can give on this bill: what it still withholds, plus what this bill already releases of it.
  const releasable = (holds ?? [])
    .filter((h) => h.billNo < bill.billNo)
    .map((h) => {
      const mine = toNumber(h.releases.find((r) => r.billId === bill.id)?.amount ?? 0);
      return { ...h, available: toNumber(h.balance) + mine };
    })
    .filter((h) => h.available > 0);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      holds: holdLinesOf(bill),
      releases: bill.releases.map((r) => ({ holdId: r.holdId, amount: toNumber(r.amount), note: r.note ?? undefined })),
    });
  }, [open, bill, form]);

  const save = useMutation({
    mutationFn: async (body: object) => (await api.put<RaBillDto>(`/ra-bills/${bill.id}/holds`, body)).data,
    onSuccess: (b) => {
      qc.setQueryData(['bills', 'detail', b.id], b);
      qc.invalidateQueries({ queryKey: ['bills'] });
      message.success(`${b.billLabel}: withheld ${formatMoney(b.withheld, b, true)}, released ${formatMoney(b.withheldReleased, b, true)}`);
    },
    meta: FAIL_NOTICE,
  });

  const submit = (v: FormValues) =>
    save.mutateAsync({
      holds: holdsBody(v.holds),
      releases: (v.releases ?? []).filter((r) => r && r.holdId).map((r) => ({ holdId: r.holdId, amount: String(r.amount ?? 0), note: r.note?.trim() || null })),
    });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={900} projectDefault={false} title={`Amounts withheld on ${bill.billLabel}`} okText="Save" onSubmit={submit}>
      <Form form={form} layout="vertical" requiredMark="optional">
        <HelpLink>What the engineer holds back on this bill for disputed items, and what this bill releases of amounts held on earlier bills as the disputes are
          settled. Neither changes GST or the contract deductions.</HelpLink>
        <Typography.Title level={5}>Withheld on this bill</Typography.Title>
        <HoldLines />
        <Typography.Title level={5} style={{ marginTop: tk.space[4] }}>
          Released of earlier holds
        </Typography.Title>
        {releasable.length === 0 && !bill.releases.length ? (
          <Typography.Paragraph type="secondary">No earlier bill of this project has an amount still withheld.</Typography.Paragraph>
        ) : (
          <LineTable
            name="releases"
            label="Released"
            newLine={() => ({})}
            addText="Release an amount"
            columns={[
              {
                key: 'holdId',
                title: 'Withheld on',
                render: (f) => (
                  <Form.Item name={[f.name, 'holdId']} noStyle rules={[{ required: true, message: 'Choose the amount withheld' }]}>
                    <Select
                      style={{ minWidth: 260 }}
                      aria-label={`Hold released, line ${f.name + 1}`}
                      options={releasable.map((h) => ({ value: h.id, label: `${h.billLabel}: ${h.description} (${formatMoney(h.available, bill, true)} withheld)` }))}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'amount',
                title: 'Released',
                width: 150,
                render: (f) => (
                  <Form.Item name={[f.name, 'amount']} noStyle rules={[{ required: true, message: 'Enter the amount released' }]}>
                    <MoneyInput aria-label={`Amount released, line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                key: 'note',
                title: 'Note',
                width: 220,
                render: (f) => (
                  <Form.Item name={[f.name, 'note']} noStyle>
                    <Input maxLength={300} placeholder="SE allowed 80%" aria-label={`Note, line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
            ]}
          />
        )}
      </Form>
    </FormShell>
  );
}

function CloseHoldModal({ hold, bill, onClose }: { hold: RaBillHoldDto | null; bill: RaBillDto; onClose: () => void }) {
  const [form] = Form.useForm<{ date: dayjs.Dayjs; note?: string }>();
  const { message } = App.useApp();
  const qc = useQueryClient();

  useEffect(() => {
    if (!hold) return;
    form.resetFields();
    form.setFieldsValue({ date: dayjs() });
  }, [hold, form]);

  const close = useMutation({
    mutationFn: async (body: object) => (await api.post<RaBillHoldDto>(`/ra-bills/holds/${hold?.id}/close`, body)).data,
    onSuccess: (h) => {
      qc.invalidateQueries({ queryKey: ['bills'] });
      message.success(`${h.description}: ${formatMoney(h.lost, bill, true)} written off as lost`);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={!!hold}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title="Close the amount withheld"
      okText={hold ? `Close with ${formatMoney(hold.balance, bill, true)} lost` : 'Close'}
      onSubmit={(v) => close.mutateAsync({ date: v.date.format('YYYY-MM-DD'), note: v.note?.trim() || null })}
    >
      <Form form={form} layout="vertical">
        {hold ? (
          <Typography.Paragraph>
            {hold.description}: {formatMoney(hold.balance, bill, true)} is still withheld. Closing writes it off for good; no later bill can release it.
          </Typography.Paragraph>
        ) : null}
        <Form.Item name="date" label="Given up on" rules={[{ required: true, message: 'Choose the date' }]}>
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="note" label="Why">
          <Input maxLength={300} placeholder="SE rejected the claim; not taken to arbitration" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
