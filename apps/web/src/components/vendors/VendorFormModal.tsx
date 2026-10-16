'use client';

import React, { useEffect } from 'react';
import { App, Checkbox, Divider, Form, Input, Select } from 'antd';
import { FormShell } from '@/components/form/FormShell';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MsmeCategory, VendorDto, VendorKind } from '@erp/shared';
import { GST_STATES, GSTIN_PATTERN, IFSC_PATTERN, MSME_CATEGORIES, MSME_CATEGORY_LABELS, PAN_PATTERN, UDYAM_PATTERN, VENDOR_KINDS, VENDOR_KIND_LABELS, canSeeVendorBank, gstStateCode } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
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
}: {
  open: boolean;
  vendor?: VendorDto | null;
  initial?: Partial<FormValues> | null;
  onClose: () => void;
  onSaved?: (v: VendorDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bank = !!user && canSeeVendorBank(user.roleKey);
  const gstin = Form.useWatch('gstin', form);
  const msme = Form.useWatch('msmeCategory', form);
  const fromGstin = gstStateCode(gstin && GSTIN_PATTERN.test(gstin.trim().toUpperCase()) ? gstin : null);

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
  }, [fromGstin, form]);

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
    onError: (e) => message.error(errorMessage(e)),
  });

  const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 16px' } as const;

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      title={vendor ? `Edit ${vendor.name}` : 'New vendor'}
      okText={vendor ? 'Save changes' : 'Add vendor'}
      onSubmit={(v) => save.mutateAsync(v)}
      layout="drawer"
      width={720}
      draftKey={vendor ? undefined : 'vendor'}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 16px' }}>
          <Form.Item name="name" label="Vendor name" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
            <Input placeholder="Maa Tarini Traders" maxLength={200} />
          </Form.Item>
          <Form.Item name="kinds" label="Supplies">
            <Select mode="multiple" placeholder="What they do for you" options={VENDOR_KINDS.map((k) => ({ value: k, label: VENDOR_KIND_LABELS[k] }))} />
          </Form.Item>
        </div>
        <div style={grid3}>
          <Form.Item name="gstin" label="GSTIN" rules={[pattern(GSTIN_PATTERN, '15 characters, like 21ABCPT1234F1Z9')]}>
            <Input placeholder="21ABCPT1234F1Z9" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="pan" label="PAN" extra={gstin ? 'Taken from the GSTIN if left empty' : undefined} rules={[pattern(PAN_PATTERN, '10 characters, like ABCPT1234F')]}>
            <Input placeholder="ABCPT1234F" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="stateCode" label="State (GST)">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!!fromGstin} placeholder="Select" options={Object.entries(GST_STATES).map(([code, name]) => ({ value: code, label: `${code} ${name}` }))} />
          </Form.Item>
        </div>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <div style={grid3}>
          <Form.Item name="contactPerson" label="Contact person">
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input maxLength={40} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not an email address' }]}>
            <Input />
          </Form.Item>
        </div>
        <div style={grid3}>
          <Form.Item name="msmeCategory" label="MSME (Udyam)" extra="Bills of micro and small enterprises are due within 45 days.">
            <Select allowClear placeholder="Not registered" options={MSME_CATEGORIES.map((c) => ({ value: c, label: MSME_CATEGORY_LABELS[c] }))} />
          </Form.Item>
          <Form.Item name="udyamNo" label="Udyam registration no." hidden={!msme} rules={[pattern(UDYAM_PATTERN, 'Like UDYAM-OD-19-0012345')]}>
            <Input placeholder="UDYAM-OD-19-0012345" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
        </div>
        {bank && (
          <>
            <Divider titlePlacement="start" plain style={{ marginTop: 0 }}>
              Bank account for payments
            </Divider>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
              <Form.Item name="bankAccountName" label="Account name">
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="bankAccountNo" label="Account number" rules={[pattern(/^[0-9A-Z]{6,20}$/, '6 to 20 letters or digits')]}>
                <Input className="mono" />
              </Form.Item>
              <Form.Item name="bankIfsc" label="IFSC" rules={[pattern(IFSC_PATTERN, '11 characters, like SBIN0001234')]}>
                <Input placeholder="SBIN0001234" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
              <Form.Item name="bankName" label="Bank and branch">
                <Input maxLength={200} />
              </Form.Item>
            </div>
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
