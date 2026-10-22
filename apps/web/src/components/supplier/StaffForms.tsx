'use client';

import React from 'react';
import { App, Form, Input, Typography } from 'antd';
import type { SupplierChangeDto, SupplierInviteResultDto, SupplierInvoiceDto } from '@erp/shared';
import { useSupplierAction } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule } from '@/components/form/inputs';

/** Accounts send a supplier's invoice back with what to fix (v6 item 105); the supplier resends it with the same number. */
export function ReturnInvoiceForm({ invoice, onClose }: { invoice: SupplierInvoiceDto | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note: string }>();
  const { message } = App.useApp();
  const send = useSupplierAction();
  return (
    <FormShell
      open={!!invoice}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={invoice ? `Return invoice ${invoice.invoiceNo}` : 'Return the invoice'}
      okText="Return to supplier"
      onSubmit={async (v) => {
        if (!invoice) return;
        await send.mutateAsync({ path: `/supplier-portal/invoices/${invoice.id}/return`, body: { note: v.note.trim() } });
        message.success(`${invoice.invoiceNo} returned to ${invoice.vendorName}`);
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="note" label="What to fix" rules={[{ required: true, whitespace: true, message: 'Say what is wrong, so the supplier can fix it' }]}>
          <Input.TextArea rows={3} maxLength={500} placeholder="The GSTIN on the invoice is not ours; send a corrected one" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Approve a supplier's change to their details (the vendor master is updated) or turn it down, with a note they see. */
export function DecideChangeForm({ decision, onClose }: { decision: { change: SupplierChangeDto; approve: boolean } | null; onClose: () => void }) {
  const [form] = Form.useForm<{ note?: string }>();
  const { message } = App.useApp();
  const send = useSupplierAction();
  const c = decision?.change;
  return (
    <FormShell
      open={!!decision}
      onClose={onClose}
      form={form}
      layout="modal"
      width={560}
      projectDefault={false}
      title={c ? `${decision?.approve ? 'Approve' : 'Turn down'} ${c.vendorName}'s change` : 'Decide the change'}
      okText={decision?.approve ? 'Approve' : 'Turn down'}
      onSubmit={async (v) => {
        if (!decision || !c) return;
        await send.mutateAsync({ path: `/supplier-portal/changes/${c.id}/decide`, body: { approve: decision.approve, note: v.note?.trim() || null } });
        message.success(decision.approve ? `${c.vendorName}'s details updated` : `${c.vendorName}'s change turned down`);
      }}
    >
      <Form form={form} layout="vertical">
        {c ? (
          <div style={{ marginBottom: 12 }}>
            {c.changes.map((x) => (
              <div key={x.field}>
                {x.label}: <span translate="no">{x.from ?? '-'}</span> to <span translate="no">{x.to ?? '-'}</span>
              </div>
            ))}
          </div>
        ) : null}
        {c?.bank && decision?.approve ? (
          <Typography.Paragraph type="secondary">Payments go to the new account from now on. Call the supplier on a number you already had to confirm it first.</Typography.Paragraph>
        ) : null}
        <Form.Item name="note" label={decision?.approve ? 'Note (optional)' : 'Why (the supplier sees this)'} rules={decision?.approve ? [] : [{ required: true, whitespace: true, message: 'Say why, so the supplier knows what to send' }]}>
          <Input.TextArea rows={3} maxLength={500} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A login on the supplier portal for one of the vendor's people: they get a link to set their password. */
export function InviteLoginForm({ vendor, onClose, onInvited }: { vendor: { id: string; name: string } | null; onClose: () => void; onInvited: (r: SupplierInviteResultDto) => void }) {
  const [form] = Form.useForm<{ fullName: string; email: string; phone?: string }>();
  const send = useSupplierAction<SupplierInviteResultDto>();
  return (
    <FormShell
      open={!!vendor}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title={vendor ? `Give ${vendor.name} a login` : 'New supplier login'}
      okText="Send invite"
      onSubmit={async (v) => {
        if (!vendor) return;
        const r = await send.mutateAsync({ path: `/supplier-portal/vendors/${vendor.id}/logins`, body: { fullName: v.fullName.trim(), email: v.email.trim(), phone: v.phone?.trim() || null } });
        onInvited(r);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          They see only this vendor&apos;s enquiries, orders, invoices and payments, and nothing about your projects or other vendors.
        </Typography.Paragraph>
        <Form.Item name="fullName" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter their name' }]}>
          <Input maxLength={120} autoComplete="off" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Enter their email' }, emailRule]}>
          <Input {...EMAIL_INPUT} autoComplete="off" />
        </Form.Item>
        <Form.Item name="phone" label="Phone (optional)" rules={[phoneRule]}>
          <Input {...PHONE_INPUT} autoComplete="off" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}
