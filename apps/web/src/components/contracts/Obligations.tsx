'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Checkbox, Dropdown, Form, Input, InputNumber, Radio, Select, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  OBLIGATION_ANCHORS,
  OBLIGATION_ANCHOR_LABELS,
  OBLIGATION_PARTIES,
  OBLIGATION_PARTY_LABELS,
  OBLIGATION_PENALTIES,
  OBLIGATION_PENALTY_LABELS,
  OBLIGATION_STATE_COLORS,
  OBLIGATION_STATE_LABELS,
  PCT_PENALTIES,
  type ContractObligationDto,
  type ContractObligationsDto,
  type ObligationAnchor,
  type ObligationParty,
  type ObligationPenalty,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useContractObligations } from '@/lib/queries';
import { formatDate, formatINR, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag, toneOf } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { MoreOutlined, PlusOutlined } from '@/components/common/icons';
import { Section } from '@/components/common/Section';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';

const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

interface FormValues {
  title?: string;
  clause?: string;
  party?: ObligationParty;
  anchor?: ObligationAnchor;
  offsetMonths?: number | null;
  offsetDays?: number | null;
  dueOn?: dayjs.Dayjs | null;
  penalty?: ObligationPenalty;
  penaltyValue?: number | null;
  metOn?: dayjs.Dayjs | null;
  waived?: boolean;
  note?: string;
}

/** "15 days after the agreement date", "2 months after the start date", or the date itself. */
function deadlineRule(o: ContractObligationDto): string {
  if (o.anchor === 'DATE') return 'A date of its own';
  const parts = [o.offsetMonths ? `${o.offsetMonths} month${o.offsetMonths === 1 ? '' : 's'}` : null, o.offsetDays ? `${o.offsetDays} day${o.offsetDays === 1 ? '' : 's'}` : null].filter(Boolean);
  const from = OBLIGATION_ANCHOR_LABELS[o.anchor].toLowerCase();
  return parts.length ? `${parts.join(' and ')} after the ${from}` : `On the ${from}`;
}

/** "0.2% of the contract, held until met", "₹20,000 a month late". */
function penaltyText(o: Pick<ContractObligationDto, 'penalty' | 'penaltyValue' | 'party'>): string {
  if (o.party === 'CLIENT') return 'Ours to chase';
  switch (o.penalty) {
    case 'WITHHOLD_PCT':
      return `${o.penaltyValue}% of the contract, held until met`;
    case 'ONCE_PCT':
      return `${o.penaltyValue}% of the contract, once`;
    case 'PER_MONTH':
      return `${formatINR(o.penaltyValue)} a month late`;
    case 'ONCE_AMOUNT':
      return `${formatINR(o.penaltyValue)}, once`;
    default:
      return 'No money on it';
  }
}

function stateNote(o: ContractObligationDto): string | null {
  if (o.daysLate !== null && o.daysLate > 0) return `${o.daysLate} day${o.daysLate === 1 ? '' : 's'} late`;
  if (o.daysLeft !== null) return o.daysLeft === 0 ? 'Today' : `${o.daysLeft} day${o.daysLeft === 1 ? '' : 's'} left`;
  if (o.state === 'NO_DATE') return 'Waiting for its anchor date';
  return null;
}

/**
 * The contract's obligations: what each side has to do by when, where each stands and what missing it costs.
 * Bills deduct what is due as of their date and give back a withholding once it is met.
 */
export function ObligationsCard({ projectId }: { projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading } = useContractObligations(projectId);
  const [editing, setEditing] = useState<ContractObligationDto | 'new' | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const key = ['contract', projectId, 'obligations'];
  const put = (d: ContractObligationsDto) => qc.setQueryData(key, d);

  const standard = useMutation({
    mutationFn: async () => (await api.post<ContractObligationsDto>(`/projects/${projectId}/contract/obligations/standard`)).data,
    onSuccess: (d) => {
      put(d);
      message.success('Standard obligations added. Check each against the contract.');
    },
    meta: FAIL_NOTICE,
  });
  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => (await api.patch<ContractObligationsDto>(`/projects/${projectId}/contract/obligations/${id}`, body)).data,
    onSuccess: put,
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete<ContractObligationsDto>(`/projects/${projectId}/contract/obligations/${id}`)).data,
    onSuccess: put,
  });

  const rows = data?.obligations ?? [];
  const canEdit = !!data?.canEdit;
  const t = data?.totals;
  const summary = t
    ? [t.overdue ? `${t.overdue} overdue` : null, t.dueSoon ? `${t.dueSoon} due within a week` : null, toNumber(t.penaltyToDate) > 0 ? `${formatINR(t.penaltyToDate)} held or recovered as of today` : null].filter(Boolean).join(' · ')
    : '';

  const extra = canEdit ? (
    <Space wrap>
      {data && data.standardMissing.length > 0 && (
        <Button onClick={() => standard.mutate()} loading={standard.isPending}>
          Add the standard obligations
        </Button>
      )}
      <Button icon={<PlusOutlined />} onClick={() => setEditing('new')}>
        New obligation
      </Button>
    </Space>
  ) : null;

  return (
    <Section title="Obligations and recoveries" extra={extra} loading={isLoading}>
      {summary && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {summary}
        </Typography.Paragraph>
      )}
      <Table<ContractObligationDto>
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        pagination={false}
        dataSource={rows}
        locale={{
          emptyText: canEdit
            ? 'No obligations yet. Add the standard ones (programme, field laboratory, technical staff, final account) and set them as the contract says.'
            : 'No obligations recorded for this contract.',
        }}
        columns={[
          {
            title: 'Obligation',
            key: 'title',
            render: (_, o) => (
              <div>
                <div>{o.title}</div>
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {[o.clause, o.party === 'CLIENT' ? OBLIGATION_PARTY_LABELS.CLIENT : null].filter(Boolean).join(' · ') || null}
                </div>
              </div>
            ),
          },
          {
            title: 'Due',
            key: 'due',
            render: (_, o) => (
              <div>
                <div translate="no">{o.due ? formatDate(o.due) : '-'}</div>
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {deadlineRule(o)}
                </div>
              </div>
            ),
          },
          {
            title: 'Where it stands',
            key: 'state',
            render: (_, o) => (
              <div>
                <AppTag tone={toneOf(OBLIGATION_STATE_COLORS[o.state])}>{OBLIGATION_STATE_LABELS[o.state]}</AppTag>
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {o.metOn ? `Met ${formatDate(o.metOn)}` : stateNote(o)}
                </div>
              </div>
            ),
          },
          { title: 'If missed', key: 'penalty', render: (_, o) => penaltyText(o) },
          {
            title: 'Cost to date',
            key: 'cost',
            align: 'right',
            render: (_, o) => {
              const cost = toNumber(o.penaltyToDate);
              const deducted = toNumber(o.deducted);
              const note = deducted === cost ? null : deducted ? `${formatINR(deducted)} on bills so far` : 'Not on a bill yet';
              return (
                <div>
                  <div translate="no">{cost ? formatINR(cost) : '-'}</div>
                  {note && (
                    <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      {note}
                    </div>
                  )}
                </div>
              );
            },
          },
          ...(canEdit
            ? [
                {
                  title: <span style={srOnly}>Actions</span>,
                  key: 'actions',
                  width: 48,
                  render: (_: unknown, o: ContractObligationDto) => (
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          { key: 'edit', label: 'Edit' },
                          ...(!o.metOn && !o.waived ? [{ key: 'met', label: 'Mark met today' }, { key: 'waive', label: 'Waive' }] : []),
                          ...(o.metOn ? [{ key: 'reopen', label: 'Not met after all' }] : []),
                          { type: 'divider' as const },
                          { key: 'delete', label: 'Delete', danger: true },
                        ],
                        onClick: ({ key: k }) => {
                          if (k === 'edit') setEditing(o);
                          if (k === 'met') patch.mutate({ id: o.id, body: { metOn: dayjs().format('YYYY-MM-DD') } });
                          if (k === 'waive') patch.mutate({ id: o.id, body: { waived: true } });
                          if (k === 'reopen') patch.mutate({ id: o.id, body: { metOn: null } });
                          if (k === 'delete')
                            askDelete({
                              what: `the obligation "${o.title}"`,
                              description: toNumber(o.deducted) ? 'A bill has deducted for it, so it cannot go: waive it instead.' : undefined,
                              onConfirm: () => remove.mutateAsync(o.id),
                            });
                        },
                      }}
                    >
                      <Button type="text" icon={<MoreOutlined />} aria-label={`More for ${o.title}`} />
                    </Dropdown>
                  ),
                },
              ]
            : []),
        ]}
      />
      {deleteDialog}
      {canEdit && <ObligationFormModal projectId={projectId} editing={editing} onClose={() => setEditing(null)} onSaved={put} />}
    </Section>
  );
}

function ObligationFormModal({ projectId, editing, onClose, onSaved }: { projectId: string; editing: ContractObligationDto | 'new' | null; onClose: () => void; onSaved: (d: ContractObligationsDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const open = editing !== null;
  const anchor = Form.useWatch('anchor', form);
  const penalty = Form.useWatch('penalty', form);
  const party = Form.useWatch('party', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (editing && editing !== 'new')
      form.setFieldsValue({
        title: editing.title,
        clause: editing.clause ?? undefined,
        party: editing.party,
        anchor: editing.anchor,
        offsetMonths: editing.offsetMonths,
        offsetDays: editing.offsetDays,
        dueOn: editing.dueOn ? dayjs(editing.dueOn) : null,
        penalty: editing.penalty,
        penaltyValue: editing.penaltyValue !== null ? Number(editing.penaltyValue) : null,
        metOn: editing.metOn ? dayjs(editing.metOn) : null,
        waived: editing.waived,
        note: editing.note ?? undefined,
      });
  }, [open, editing, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        title: v.title?.trim(),
        clause: v.clause?.trim() || null,
        party: v.party ?? 'CONTRACTOR',
        anchor: v.anchor ?? 'AGREEMENT',
        offsetMonths: v.offsetMonths ?? 0,
        offsetDays: v.offsetDays ?? 0,
        dueOn: v.dueOn ? v.dueOn.format('YYYY-MM-DD') : null,
        penalty: v.party === 'CLIENT' ? 'NONE' : (v.penalty ?? 'NONE'),
        penaltyValue: v.party === 'CLIENT' || !v.penalty || v.penalty === 'NONE' || !v.penaltyValue ? null : String(v.penaltyValue),
        metOn: v.metOn ? v.metOn.format('YYYY-MM-DD') : null,
        waived: !!v.waived,
        note: v.note?.trim() || null,
      };
      const url = `/projects/${projectId}/contract/obligations`;
      return (editing && editing !== 'new' ? await api.patch<ContractObligationsDto>(`${url}/${editing.id}`, body) : await api.post<ContractObligationsDto>(url, body)).data;
    },
    onSuccess: (d) => {
      onSaved(d);
      message.success('Obligation saved');
    },
    meta: FAIL_NOTICE,
  });

  const pct = !!penalty && PCT_PENALTIES.includes(penalty);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      title={editing && editing !== 'new' ? 'Edit obligation' : 'New obligation'}
      okText="Save"
      projectDefault={false}
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical" requiredMark="optional" initialValues={{ party: 'CONTRACTOR', anchor: 'AGREEMENT', offsetMonths: 0, offsetDays: 0, penalty: 'NONE', waived: false }}>
        <FormGrid cols={2}>
          <Form.Item name="title" label="What has to be done" rules={[{ required: true, whitespace: true, message: 'Say what has to be done' }]}>
            <Input maxLength={200} placeholder="Submit the construction programme" />
          </Form.Item>
          <Form.Item name="clause" label="Clause">
            <Input maxLength={60} placeholder="GCC 13.1" />
          </Form.Item>
        </FormGrid>
        <Form.Item name="party" label="Who owes it">
          <Radio.Group options={OBLIGATION_PARTIES.map((p) => ({ value: p, label: OBLIGATION_PARTY_LABELS[p] }))} />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="anchor" label="Counted from">
            <Select<ObligationAnchor> options={OBLIGATION_ANCHORS.map((a) => ({ value: a, label: OBLIGATION_ANCHOR_LABELS[a] }))} />
          </Form.Item>
          {anchor === 'DATE' ? (
            <Form.Item name="dueOn" label="Due on" rules={[{ required: true, message: 'Choose the date it is due' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="offsetMonths" label="Months after">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={120} precision={0} inputMode="numeric" />
              </Form.Item>
              <Form.Item name="offsetDays" label="Days after">
                <InputNumber<number> style={{ width: '100%' }} min={0} max={3650} precision={0} inputMode="numeric" />
              </Form.Item>
            </>
          )}
        </FormGrid>
        {party !== 'CLIENT' && (
          <FormGrid cols={2}>
            <Form.Item name="penalty" label="If missed">
              <Select<ObligationPenalty> options={OBLIGATION_PENALTIES.map((p) => ({ value: p, label: OBLIGATION_PENALTY_LABELS[p] }))} />
            </Form.Item>
            {penalty && penalty !== 'NONE' ? (
              <Form.Item name="penaltyValue" label={pct ? 'Of the contract value' : 'Amount'} rules={[{ required: true, message: pct ? 'Give the % of the contract value' : 'Give the amount' }]}>
                {pct ? <InputNumber<number> style={{ width: '100%' }} min={0.001} max={100} step={0.1} suffix="%" /> : <MoneyInput />}
              </Form.Item>
            ) : null}
          </FormGrid>
        )}
        <FormGrid cols={2}>
          <Form.Item name="metOn" label="Met on" extra="Bills give back a withholding from the first bill after this day">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="waived" label="Waived" valuePropName="checked">
            <Checkbox>The client let it go</Checkbox>
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
