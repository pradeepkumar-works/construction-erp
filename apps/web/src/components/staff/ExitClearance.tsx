'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, Radio, Table, Typography } from 'antd';
import type { ClearanceState, EmployeeDto, ExitClearanceDto, LetterheadDto } from '@erp/shared';
import { CLEARANCE_STATE_LABELS, clearanceLineProblem } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { Section } from '@/components/common/Section';
import { PrinterOutlined } from '@/components/common/icons';
import { FormShell } from '@/components/form/FormShell';
import { MoneyInput } from '@/components/form/inputs';
import { esc, inr, openPrintWindow, printDocHtml, signLine } from '@/components/print/printDoc';
import { usePrintPaper } from '@/components/print/usePrintPaper';
import { useClearExit, useExitClearance } from '@/lib/queries';
import { formatDate, formatDateTime, formatINR, NO_VALUE } from '@/lib/format';
import { tk } from '@/ds';

type Line = ExitClearanceDto['lines'][number];
interface Values {
  state: ClearanceState;
  amount?: number | null;
  note?: string;
}

/** Sign one clearance item off: cleared, not applicable (and why), or dues the full and final recovers. */
function SignOffModal({ employee, line, onClose }: { employee: EmployeeDto; line: Line | null; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const clear = useClearExit(employee.id);
  const state = Form.useWatch('state', form);
  return (
    <FormShell
      open={!!line}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={line?.name ?? ''}
      okText="Save"
      onSubmit={async (v) => {
        const note = v.note?.trim() || null;
        const amount = v.state === 'DUES' ? (v.amount ?? null) : null;
        await clear.mutateAsync({ code: line!.code, state: v.state, amount, note });
        message.success(v.state === 'PENDING' ? `${line!.name}: back to clear` : `${line!.name}: ${CLEARANCE_STATE_LABELS[v.state].toLowerCase()}`);
      }}
    >
      <Form
        key={line?.code}
        form={form}
        layout="vertical"
        initialValues={line ? { state: line.state === 'PENDING' ? 'CLEARED' : line.state, amount: line.amount ? Number(line.amount) : null, note: line.note ?? undefined } : undefined}
      >
        <Form.Item name="state" label={`For ${employee.fullName}`}>
          <Radio.Group
            options={(['CLEARED', 'DUES', 'NOT_APPLICABLE', ...(line && line.state !== 'PENDING' ? (['PENDING'] as const) : [])] as ClearanceState[]).map((s) => ({
              value: s,
              label: s === 'PENDING' ? 'Take back to clear' : CLEARANCE_STATE_LABELS[s],
            }))}
          />
        </Form.Item>
        {state === 'DUES' && (
          <Form.Item
            name="amount"
            label="Amount to recover"
            extra="The full and final settlement takes it off what is paid"
            rules={[{ validator: (_, v) => (v && v > 0 ? Promise.resolve() : Promise.reject(new Error('Enter the amount to recover'))) }]}
          >
            <MoneyInput />
          </Form.Item>
        )}
        <Form.Item
          name="note"
          label={state === 'DUES' ? 'What the dues are for' : state === 'NOT_APPLICABLE' ? 'Why it does not apply' : 'Note'}
          rules={[
            {
              validator: (_, v: string | undefined) => {
                const s = form.getFieldValue('state') as ClearanceState;
                const p = s === 'DUES' || s === 'NOT_APPLICABLE' ? clearanceLineProblem(s, s === 'DUES' ? 1 : null, v) : null;
                return p ? Promise.reject(new Error(p)) : Promise.resolve();
              },
            },
          ]}
        >
          <Input.TextArea rows={2} maxLength={300} placeholder={state === 'DUES' ? 'Two safety helmets not returned' : undefined} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The no dues certificate on the letterhead: every item and who signed it off, and the dues the settlement recovers. */
export function noDuesHtml(employee: EmployeeDto, c: ExitClearanceDto, letterhead: LetterheadDto): string {
  const rows = c.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.name)}</td><td>${esc(CLEARANCE_STATE_LABELS[l.state])}${l.note ? `<div class="muted">${esc(l.note)}</div>` : ''}</td><td class="num">${l.amount ? inr(l.amount) : ''}</td><td>${esc(l.clearedByName ?? '')}${l.clearedAt ? `<div class="muted">${esc(formatDate(l.clearedAt))}</div>` : ''}</td></tr>`,
    )
    .join('');
  const dues = Number(c.dues);
  return printDocHtml({
    letterhead,
    title: 'No dues certificate',
    number: `NDC-${employee.employeeCode}`,
    date: formatDate(new Date().toISOString()),
    body: `<p>This is to certify that ${esc(employee.fullName)} (${esc(employee.employeeCode)}), ${esc(employee.designation)}, whose last working day was ${esc(formatDate(c.leftOn))}, has handed over and settled everything below.${
      dues ? ` Dues of ${esc(formatINR(dues))} are recovered through the full and final settlement.` : ' Nothing is due from them.'
    }</p>
<table><thead><tr><th>Item</th><th>Signed off as</th><th class="num">Dues (₹)</th><th>By</th></tr></thead><tbody>${rows}</tbody></table>`,
    signs: [signLine('Human resources'), signLine('Accounts'), signLine('Employee', employee.fullName)],
  });
}

/**
 * Exit clearance for someone whose exit is recorded: each item of the company's list (Masters › Exit clearance items)
 * signed off by HR, accounts, stores or the site's manager. The full and final waits for it and recovers the dues.
 */
export function ExitClearance({ employee }: { employee: EmployeeDto }) {
  const { data, isLoading } = useExitClearance(employee.id);
  const print = usePrintPaper();
  const [signing, setSigning] = useState<Line | null>(null);
  const lines = data?.lines ?? [];
  const done = lines.filter((l) => l.state !== 'PENDING').length;
  const dues = Number(data?.dues ?? 0);
  return (
    <Section
      title="Exit clearance"
      loading={isLoading}
      style={{ marginTop: tk.space[4] }}
      extra={
        data && !data.problem && lines.length > 0 ? (
          <Button size="small" icon={<PrinterOutlined />} onClick={() => print((l) => openPrintWindow(noDuesHtml(employee, data, l)))}>
            No dues certificate
          </Button>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">
        {lines.length === 0
          ? 'The company has no clearance items. Add them in Masters, under Exit clearance items.'
          : `${done} of ${lines.length} signed off${dues ? `; dues of ${formatINR(dues)} come off the full and final` : ''}. ${data?.problem ? 'The full and final is approved once every item is signed off.' : 'Nothing is left to clear.'}`}
      </Typography.Paragraph>
      <Table<Line>
        rowKey="code"
        size="small"
        pagination={false}
        dataSource={lines}
        scroll={{ x: 640 }}
        columns={[
          { title: 'Item', dataIndex: 'name', width: 200 },
          { title: 'State', dataIndex: 'state', width: 150, render: (v: ClearanceState) => <AppTag kind="clearance" status={v}>{CLEARANCE_STATE_LABELS[v]}</AppTag> },
          { title: 'Dues', dataIndex: 'amount', width: 110, align: 'right', render: (v: string | null) => (v ? <span translate="no">{formatINR(v)}</span> : NO_VALUE) },
          {
            title: 'Signed off',
            key: 'by',
            width: 200,
            render: (_, l) =>
              l.clearedByName ? (
                <span>
                  {l.clearedByName}
                  <Typography.Text type="secondary"> {formatDateTime(l.clearedAt)}</Typography.Text>
                  {l.note && <div>{l.note}</div>}
                </span>
              ) : (
                NO_VALUE
              ),
          },
          ...(data?.canClear
            ? [
                {
                  title: 'Actions',
                  key: 'act',
                  width: 110,
                  render: (_: unknown, l: Line) => (
                    <Button size="small" onClick={() => setSigning(l)} aria-label={`Sign off ${l.name}`}>
                      {l.state === 'PENDING' ? 'Sign off' : 'Change'}
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
      {data?.canClear && <SignOffModal employee={employee} line={signing} onClose={() => setSigning(null)} />}
    </Section>
  );
}
