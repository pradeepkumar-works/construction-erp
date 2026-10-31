'use client';

import React, { useEffect } from 'react';
import { App, Button, Checkbox, Divider, Form, Input, Select } from 'antd';
import { ContactsOutlined } from '@/components/common/icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, EMAIL_INPUT, PHONE_INPUT, emailRule, phoneRule, upper } from '@/components/form/inputs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MsmeCategory, VendorDto, VendorKind } from '@erp/shared';
import { GST_STATES, GSTIN_PATTERN, IFSC_PATTERN, MSME_CATEGORIES, MSME_CATEGORY_LABELS, PAN_PATTERN, panFromGstin, UDYAM_PATTERN, VENDOR_KINDS, VENDOR_KIND_LABELS, canSeeVendorBank, gstStateCode } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';

interface FormValues {
  name: string;
  kinds?: VendorKind[];
  gstin?: string;
  pan?: string;
  stateCode?: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  msmeCategory?: MsmeCategory;
  udyamNo?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankName?: string;
  remarks?: string;
  isActive?: boolean;
}

const up = (v?: string) => v?.replace(/\s+/g, '').toUpperCase() || null;
const pattern = (re: RegExp, message: string) => ({ validator: async (_: unknown, v?: string) => (!v || re.test(v.replace(/\s+/g, '').toUpperCase()) ? undefined : Promise.reject(new Error(message))) });

/**
 * Add or edit a vendor. `initial` pre-fills a new vendor (e.g. a name typed on expenses); `onSaved` gets the saved
 * vendor. Bank details are shown only to roles that pay vendors.
 */
export function VendorFormModal({
  open,
  vendor,
  initial,
  onClose,
  onSaved,
  onPortal,
}: {
  open: boolean;
  vendor?: VendorDto | null;
  initial?: Partial<FormValues> | null;
  onClose: () => void;
  onSaved?: (v: VendorDto) => void;
  /** Opens the vendor's supplier-portal logins (v6 item 105); the way there on a phone, where the list has no actions */
  onPortal?: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bank = !!user && canSeeVendorBank(user.roleKey);
  const gstin = Form.useWatch('gstin', form);
  const msme = Form.useWatch('msmeCategory', form);
  const fromGstin = gstStateCode(gstin && GSTIN_PATTERN.test(gstin.trim().toUpperCase()) ? gstin : null);
  // The PAN is inside the GSTIN (finding 17 of the October review); it fills an empty box, never one already typed.
  const panOfGstin = panFromGstin(gstin);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (vendor)
      form.setFieldsValue({
        name: vendor.name,
        kinds: vendor.kinds,
        gstin: vendor.gstin ?? undefined,
        pan: vendor.pan ?? undefined,
        stateCode: vendor.stateCode ?? undefined,
        address: vendor.address ?? undefined,
        contactPerson: vendor.contactPerson ?? undefined,
        email: vendor.email ?? undefined,
        phone: vendor.phone ?? undefined,
        msmeCategory: vendor.msmeCategory ?? undefined,
        udyamNo: vendor.udyamNo ?? undefined,
        bankAccountName: vendor.bankAccountName ?? undefined,
        bankAccountNo: vendor.bankAccountNo ?? undefined,
        bankIfsc: vendor.bankIfsc ?? undefined,
        bankName: vendor.bankName ?? undefined,
        remarks: vendor.remarks ?? undefined,
        isActive: vendor.isActive,
      });
    else if (initial) form.setFieldsValue(initial);
  }, [open, vendor, initial, form]);

  useEffect(() => {
    if (fromGstin) form.setFieldValue('stateCode', fromGstin);
    if (panOfGstin && !form.getFieldValue('pan')) form.setFieldValue('pan', panOfGstin);
  }, [fromGstin, panOfGstin, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        name: v.name.trim(),
        kinds: v.kinds ?? [],
        gstin: up(v.gstin),
        pan: up(v.pan),
        stateCode: v.stateCode || null,
        address: v.address?.trim() || null,
        contactPerson: v.contactPerson?.trim() || null,
        email: v.email?.trim() || null,
        phone: v.phone?.trim() || null,
        msmeCategory: v.msmeCategory ?? null,
        udyamNo: v.msmeCategory ? up(v.udyamNo) : null,
        remarks: v.remarks?.trim() || null,
        ...(bank ? { bankAccountName: v.bankAccountName?.trim() || null, bankAccountNo: up(v.bankAccountNo), bankIfsc: up(v.bankIfsc), bankName: v.bankName?.trim() || null } : {}),
        ...(vendor ? { isActive: v.isActive ?? true } : {}),
      };
      return vendor ? (await api.patch<VendorDto>(`/vendors/${vendor.id}`, body)).data : (await api.post<VendorDto>('/vendors', body)).data;
    },
    onSuccess: (v) => {
      const linked = v.expenseCount + v.equipmentCount + v.grnCount;
      message.success(vendor ? 'Vendor updated' : `${v.name} added${linked ? `, linked to ${linked} entr${linked === 1 ? 'y' : 'ies'} that named it` : ''}`);
      for (const k of ['vendors', 'expenses', 'machinery', 'stock']) qc.invalidateQueries({ queryKey: [k] });
      onSaved?.(v);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={vendor ? `Edit ${vendor.name}` : 'New vendor'}
      okText="Save vendor"
      onSubmit={(v) => save.mutateAsync(v)}
      layout="drawer"
      width={720}
      draftKey={vendor ? undefined : 'vendor'}
    >
      <Form form={form} layout="vertical">
        {vendor && onPortal ? (
          <Button type="link" icon={<ContactsOutlined />} onClick={onPortal} style={{ paddingInline: 0, marginBottom: 8 }}>
            Supplier portal logins
          </Button>
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="name" label="Vendor name" rules={[{ required: true, whitespace: true, message: 'Enter the vendor name' }]}>
            <Input placeholder="Maa Tarini Traders" maxLength={200} />
          </Form.Item>
          <Form.Item name="kinds" label="Supplies">
            <Select mode="multiple" placeholder="Materials or services they supply" options={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABELS[k] }))} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={3}>
          <Form.Item name="gstin" label="GSTIN" normalize={upper} rules={[pattern(GSTIN_PATTERN, 'A GSTIN is 15 characters, e.g. 21ABCPT1234F1Z9')]}>
            <Input {...CODE_INPUT} placeholder="21ABCPT1234F1Z9" />
          </Form.Item>
          <Form.Item name="pan" label="PAN" normalize={upper} extra={gstin ? 'Taken from the GSTIN if left empty' : undefined} rules={[pattern(PAN_PATTERN, 'A PAN is 10 characters, e.g. ABCPT1234F')]}>
            <Input {...CODE_INPUT} placeholder="ABCPT1234F" />
          </Form.Item>
          <Form.Item name="stateCode" label="State (GST)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!!fromGstin} placeholder="Choose the state" options={Object.entries(GST_STATES).map(([code, name]) => ({ value: code, label: `${code} ${name}` }))} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <FormGrid cols={3}>
          <Form.Item name="contactPerson" label="Contact person">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
            <Input {...PHONE_INPUT} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[emailRule]}>
            <Input {...EMAIL_INPUT} />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="msmeCategory" label="MSME (Udyam)" extra="Bills of micro and small enterprises are due within 45 days.">
            <Select allowClear placeholder="Not registered" options={MSME_CATEGORIES.map((c) => ({ value: c, label: MSME_CATEGORY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="udyamNo" label="Udyam registration no." normalize={upper} hidden={!msme} rules={[pattern(UDYAM_PATTERN, 'Enter it as on the certificate, e.g. UDYAM-OD-19-0012345')]}>
            <Input {...CODE_INPUT} placeholder="UDYAM-OD-19-0012345" />
          </Form.Item>
        </FormGrid>
        {bank && (
          <>
            <Divider titlePlacement="start" plain style={{ marginTop: 0 }}>
              Bank account for payments
            </Divider>
            <FormGrid cols={2}>
              <Form.Item name="bankAccountName" label="Account name">
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="bankAccountNo" label="Account number" rules={[pattern(/^[0-9A-Z]{6,20}$/, 'Enter 6 to 20 letters or digits')]}>
                <Input className="mono" />
              </Form.Item>
              <Form.Item name="bankIfsc" label="IFSC" normalize={upper} rules={[pattern(IFSC_PATTERN, 'An IFSC is 11 characters, e.g. SBIN0001234')]}>
                <Input {...CODE_INPUT} placeholder="SBIN0001234" />
              </Form.Item>
              <Form.Item name="bankName" label="Bank and branch">
                <Input maxLength={200} />
              </Form.Item>
            </FormGrid>
          </>
        )}
        <Form.Item name="remarks" label="Remarks">
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
        {vendor ? (
          <Form.Item name="isActive" valuePropName="checked" style={{ marginBottom: 0 }} extra="Inactive vendors are not suggested on new entries.">
            <Checkbox>Active</Checkbox>
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}
