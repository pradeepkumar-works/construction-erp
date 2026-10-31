'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContractCurrency, RaBillDto, RaBillStageLineDto, SlippageLineDto } from '@erp/shared';
import { STAGE_TRIGGER_LABELS } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatDate, formatMoney, formatPct, toNumber, NO_VALUE } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { FormShell } from '@/components/form/FormShell';

const pct = (v: string | number | null) => (v === null ? NO_VALUE : <span className="mono" translate="no">{formatPct(v, { digits: toNumber(v) % 1 ? 2 : 0 })}</span>);
const money = (v: string, c: ContractCurrency) => <span className="mono" translate="no">{formatMoney(v, c, true)}</span>;

/**
 * A lump-sum bill's payment stages: what each stage's evidence gave at the measurements date, what earlier
 * bills took, this bill's % (the suggestion, or a claim made by hand) and the amount. The preparer can claim a stage by
 * hand while the bill is a draft.
 */
export function BillStages({ bill, editable }: { bill: RaBillDto; editable: boolean }) {
  const [claiming, setClaiming] = useState<RaBillStageLineDto | null>(null);
  const certified = bill.stageLines.some((l) => l.certifiedPct !== null);
  const moving = bill.stageLines.filter((l) => toNumber(l.thisPct) > 0 || l.claimedByHand || toNumber(l.suggestedPct) > 0);
  const [all, setAll] = useState(false);
  const rows = all ? bill.stageLines : moving;
  return (
    <>
      <Typography.Paragraph type="secondary">
        {moving.length} of {bill.stageLines.length} stages move in this bill. Each takes what its evidence gave on {formatDate(bill.measuredUpTo)} less what earlier bills took.
        {moving.length < bill.stageLines.length ? (
          <Button type="link" size="small" onClick={() => setAll(!all)}>
            {all ? 'Show only those that move' : 'Show all stages'}
          </Button>
        ) : null}
      </Typography.Paragraph>
      <Table<RaBillStageLineDto>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 1100 }}
        columns={[
          {
            title: 'Stage',
            key: 'stage',
            render: (_, l) => (
              <div>
                <span className="mono" translate="no">
                  {l.componentCode}
                </span>{' '}
                {l.componentName}: <strong>{l.stageName}</strong>
                <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {formatPct(l.stagePct)} of the component, {STAGE_TRIGGER_LABELS[l.trigger].toLowerCase()}. {l.evidenceText}
                </div>
              </div>
            ),
          },
          { title: 'Value', dataIndex: 'stageValue', width: 130, align: 'right', render: (v: string) => money(v, bill) },
          { title: 'Previous', dataIndex: 'prevPct', width: 90, align: 'right', render: pct },
          {
            title: 'This bill',
            key: 'this',
            width: 150,
            align: 'right',
            render: (_, l) => (
              <div>
                <strong>{pct(l.thisPct)}</strong>
                {l.claimedByHand ? (
                  <div>
                    <Tooltip title={l.note ?? undefined}>
                      <AppTag tone="pending" style={{ marginInlineEnd: 0 }}>
                        Claimed over the evidence
                      </AppTag>
                    </Tooltip>
                    <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                      Evidence gives {formatPct(l.suggestedPct, { digits: 2 })}
                    </div>
                  </div>
                ) : null}
              </div>
            ),
          },
          ...(certified
            ? [
                {
                  title: 'Certified',
                  dataIndex: 'certifiedPct',
                  width: 100,
                  align: 'right' as const,
                  render: (v: string | null, l: RaBillStageLineDto) => <span style={v !== null && toNumber(v) !== toNumber(l.thisPct) ? { color: themeColor('colorErrorText') } : undefined}>{pct(v)}</span>,
                },
              ]
            : []),
          { title: 'Up to date', dataIndex: 'uptoPct', width: 100, align: 'right', render: pct },
          { title: 'Amount', dataIndex: 'amount', width: 130, align: 'right', render: (v: string) => <strong>{money(v, bill)}</strong> },
          ...(editable
            ? [
                {
                  title: '',
                  key: 'claim',
                  width: 90,
                  render: (_: unknown, l: RaBillStageLineDto) => (
                    <Button type="link" size="small" onClick={() => setClaiming(l)} aria-label={`Claim ${l.componentCode} ${l.stageName} by hand`}>
                      Claim
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      {editable ? <ClaimModal bill={bill} line={claiming} onClose={() => setClaiming(null)} /> : null}
    </>
  );
}

function ClaimModal({ bill, line, onClose }: { bill: RaBillDto; line: RaBillStageLineDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ pct: number | null; note?: string }>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: async (body: { pct: string | null; note: string | null }) => (await api.put<RaBillDto>(`/ra-bills/${bill.id}/stages/${line!.stageId}`, body)).data,
    onSuccess: (b) => {
      qc.setQueryData(['bills', 'detail', b.id], b);
      qc.invalidateQueries({ queryKey: ['bills'] });
      message.success(`${b.billLabel} re-priced: ${formatMoney(b.grossAmount, b, true)} of work`);
    },
    meta: FAIL_NOTICE,
  });
  useEffect(() => {
    if (!line) return;
    form.resetFields();
    form.setFieldsValue({ pct: toNumber(line.thisPct), note: line.note ?? undefined });
  }, [line, form]);
  const value = Form.useWatch('pct', form);
  const suggested = line ? toNumber(line.suggestedPct) : 0;
  const left = line ? Math.max(0, 100 - toNumber(line.prevPct)) : 100;
  return (
    <FormShell
      open={!!line}
      onClose={onClose}
      form={form}
      layout="modal"
      title={line ? `${line.componentCode} ${line.stageName}` : ''}
      okText="Save claim"
      onSubmit={(v) => claim.mutateAsync({ pct: v.pct === null || v.pct === undefined ? null : String(v.pct), note: v.note?.trim() || null })}
      footerExtra={
        line?.claimedByHand ? (
          <Button loading={claim.isPending} onClick={() => claim.mutateAsync({ pct: null, note: null }).then(onClose)}>
            Use the evidence's %
          </Button>
        ) : null
      }
    >
      {line ? (
        <Form form={form} layout="vertical" requiredMark="optional">
          <Typography.Paragraph type="secondary">
            {line.evidenceText}. The evidence gives {formatPct(suggested, { digits: 2 })} this bill; {formatPct(line.prevPct, { digits: 2 })} was billed before, so up to {formatPct(left, { digits: 2 })} is left.
          </Typography.Paragraph>
          <Form.Item name="pct" label="This bill (% of the stage)" rules={[{ required: true, message: 'Enter the % to claim' }]}>
            <InputNumber min={0} max={left} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="note"
            label="Why"
            extra="Needed when you claim more than the evidence gives"
            rules={[{ required: (value ?? 0) > suggested + 0.0005, whitespace: true, message: 'Say why you claim more than the evidence gives' }]}
          >
            <Input.TextArea rows={2} maxLength={300} placeholder="e.g. Staging lift 5 cast on 18 Oct, cubes awaited" />
          </Form.Item>
        </Form>
      ) : null}
    </FormShell>
  );
}

/** Why a bill withholds (or releases) for milestone slippage: each component behind its target and its tier. */
export function SlippageNotes({ lines, withheld, c }: { lines: SlippageLineDto[]; withheld: string; c: ContractCurrency }) {
  const net = toNumber(withheld);
  return (
    <>
      <Typography.Paragraph type="secondary">
        {lines.length
          ? `Behind the milestone targets at the measurements date. This bill ${net < 0 ? `releases ${formatMoney(-net, c, true)}` : `withholds ${formatMoney(net, c, true)}`}: the total below less what earlier bills withheld.`
          : net < 0
            ? `Every component is on its target, so this bill releases the ${formatMoney(-net, c, true)} earlier bills withheld.`
            : 'Every component is on its target.'}
      </Typography.Paragraph>
      {lines.length ? (
        <Table<SlippageLineDto>
          rowKey="componentId"
          size="small"
          pagination={false}
          dataSource={lines}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Component', key: 'name', render: (_, l) => <span><span className="mono" translate="no">{l.code}</span> {l.name}</span> },
            { title: 'Target', dataIndex: 'targetPct', align: 'right', render: (v: number) => pct(v) },
            { title: 'Billed', dataIndex: 'actualPct', align: 'right', render: (v: number) => pct(v) },
            { title: 'Behind by', dataIndex: 'behindPct', align: 'right', render: (v: number) => `${formatPct(v)} of the target` },
            { title: 'Slab', dataIndex: 'tierPct', align: 'right', render: (v: number) => pct(v) },
            { title: 'Withheld to date', dataIndex: 'withheld', align: 'right', render: (v: string) => <strong>{money(v, c)}</strong> },
          ]}
        />
      ) : null}
    </>
  );
}
