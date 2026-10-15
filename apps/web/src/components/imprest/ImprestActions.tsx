'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImprestDetailDto, ImprestDto, PaymentMode } from '@erp/shared';
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, canHoldImprest } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useUsers } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { ProjectSelect } from '@/components/common/ProjectSelect';

const MODES = PAYMENT_MODES.filter((m) => m !== 'CREDIT').map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }));
const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : undefined);

/** One of the money actions on an imprest; each is a small form in a modal. */
export type ImprestAction =
  | { kind: 'open'; projectId?: string }
  | { kind: 'topup'; imprest: ImprestDto }
  | { kind: 'pay'; imprest: ImprestDto }
  | { kind: 'reject'; imprest: ImprestDto }
  | { kind: 'advance'; imprest: ImprestDto }
  | { kind: 'return'; imprest: ImprestDto }
  | { kind: 'float'; imprest: ImprestDto };

const TITLES: Record<ImprestAction['kind'], string> = {
  open: 'Open an imprest',
  topup: 'Ask for a top-up',
  pay: 'Pay the top-up',
  reject: 'Turn down the top-up',
  advance: 'Advance cash',
  return: 'Record cash returned',
  float: 'Change the float',
};

const OK: Record<ImprestAction['kind'], string> = { open: 'Open imprest', topup: 'Ask for top-up', pay: 'Pay', reject: 'Turn down', advance: 'Advance cash', return: 'Record return', float: 'Save' };

interface Values {
  projectId?: string;
  holderId?: string;
  amount?: number | null;
  date?: dayjs.Dayjs | null;
  paymentMode?: PaymentMode;
  reference?: string;
  note?: string;
  payFloat?: boolean;
}

export function ImprestActionModal({ action, onClose, onDone }: { action: ImprestAction | null; onClose: () => void; onDone?: (id: string) => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const users = useUsers();
  const kind = action?.kind;
  const imp = action && action.kind !== 'open' ? action.imprest : null;

  useEffect(() => {
    if (!action) return;
    form.resetFields();
    const i = action.kind !== 'open' ? action.imprest : null;
    form.setFieldsValue({
      projectId: action.kind === 'open' ? action.projectId : undefined,
      amount:
        action.kind === 'topup' ? Number(i!.topUpDue) || null : action.kind === 'pay' ? Number(i!.openRequest?.amount ?? 0) : action.kind === 'float' ? Number(i!.floatAmount) : action.kind === 'return' ? Number(i!.cashInHand) || null : null,
      date: dayjs(),
      paymentMode: action.kind === 'open' ? 'CASH' : 'BANK',
      payFloat: true,
    });
  }, [action, form]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const amount = v.amount === null || v.amount === undefined ? undefined : String(v.amount);
      switch (action!.kind) {
        case 'open':
          return (await api.post<ImprestDetailDto>('/imprests', { projectId: v.projectId, holderId: v.holderId, floatAmount: amount, payFloat: !!v.payFloat, paymentMode: v.paymentMode, reference: v.reference || undefined, note: v.note || undefined })).data;
        case 'topup':
          return (await api.post<ImprestDetailDto>(`/imprests/${imp!.id}/top-ups`, { amount, reason: v.note || undefined })).data;
        case 'pay':
          return (await api.post<ImprestDetailDto>(`/imprests/entries/${imp!.openRequest!.id}/pay`, { amount, paidOn: ymd(v.date), paymentMode: v.paymentMode, reference: v.reference || undefined, note: v.note || undefined })).data;
        case 'reject':
          return (await api.post<ImprestDetailDto>(`/imprests/entries/${imp!.openRequest!.id}/reject`, { note: v.note })).data;
        case 'advance':
          return (await api.post<ImprestDetailDto>(`/imprests/${imp!.id}/advances`, { amount, paidOn: ymd(v.date), paymentMode: v.paymentMode, reference: v.reference || undefined, note: v.note || undefined })).data;
        case 'return':
          return (await api.post<ImprestDetailDto>(`/imprests/${imp!.id}/returns`, { amount, date: ymd(v.date), note: v.note || undefined })).data;
        case 'float':
          return (await api.patch<ImprestDetailDto>(`/imprests/${imp!.id}`, { floatAmount: amount })).data;
      }
    },
    onSuccess: (d) => {
      const done: Record<ImprestAction['kind'], string> = {
        open: `Imprest opened for ${d.holderName}`,
        topup: 'Top-up asked for',
        pay: 'Top-up paid',
        reject: 'Top-up turned down',
        advance: 'Cash advanced',
        return: 'Cash returned recorded',
        float: 'Float changed',
      };
      message.success(done[action!.kind]);
      qc.invalidateQueries({ queryKey: ['imprests'] });
      onDone?.(d.id);
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const needsAmount = kind !== 'reject';
  const amountLabel = kind === 'open' || kind === 'float' ? 'Float (₹)' : kind === 'return' ? 'Amount returned (₹)' : 'Amount (₹)';
  const paying = kind === 'pay' || kind === 'advance' || kind === 'open';

  return (
    <Modal open={!!action} title={kind ? TITLES[kind] : ''} okText={kind ? OK[kind] : 'Save'} onCancel={onClose} onOk={() => form.submit()} confirmLoading={save.isPending} destroyOnHidden>
      {imp ? (
        <p className="text-muted" style={{ marginTop: 0 }}>
          {imp.holderName} at {imp.projectName}: {formatINR(imp.cashInHand, true)} in hand of a {formatINR(imp.floatAmount)} float.
          {kind === 'pay' && imp.openRequest?.reason ? ` Asked for: ${imp.openRequest.reason}` : ''}
        </p>
      ) : null}
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark="optional">
        {kind === 'open' ? (
          <>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Pick the project' }]}>
              <ProjectSelect placeholder="Pick the project" allowClear={false} />
            </Form.Item>
            <Form.Item name="holderId" label="Held by" rules={[{ required: true, message: 'Pick who holds the cash' }]} extra="The site in-charge whose cash expenses spend it">
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                loading={users.isLoading}
                options={(users.data ?? []).filter((u) => u.isActive && canHoldImprest(u.roleKey)).map((u) => ({ value: u.id, label: `${u.fullName} (${u.roleName})` }))}
              />
            </Form.Item>
          </>
        ) : null}
        {needsAmount ? (
          <Form.Item name="amount" label={amountLabel} rules={[{ required: kind !== 'topup', message: 'Enter the amount' }]} extra={kind === 'topup' ? 'Empty: what brings the cash back to the float' : undefined}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        ) : null}
        {kind === 'open' ? (
          <Form.Item name="payFloat" valuePropName="checked">
            <Checkbox>The float is paid now</Checkbox>
          </Form.Item>
        ) : null}
        {kind === 'pay' || kind === 'advance' || kind === 'return' ? (
          <Form.Item name="date" label={kind === 'return' ? 'Returned on' : 'Paid on'}>
            <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        ) : null}
        {paying ? (
          <>
            <Form.Item name="paymentMode" label="Paid by">
              <Select options={MODES} />
            </Form.Item>
            <Form.Item name="reference" label="Reference" extra="Cheque, UTR or voucher number">
              <Input maxLength={80} />
            </Form.Item>
          </>
        ) : null}
        {kind !== 'float' ? (
          <Form.Item
            name="note"
            label={kind === 'topup' ? 'What for' : kind === 'reject' ? 'Why' : 'Note'}
            rules={kind === 'reject' ? [{ required: true, whitespace: true, message: 'Say why, so the holder knows' }] : undefined}
          >
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
