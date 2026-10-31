'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, InputNumber, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import type { EmployeeDto, EmploymentType, Gender } from '@erp/shared';
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, ESI_PATTERN, GENDERS, GENDER_LABELS, UAN_PATTERN, canViewEmployeePrivate } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE } from '@/lib/notify';
import { useEmployees, useLinkableUsers, useProjects } from '@/lib/queries';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { CODE_INPUT, EMAIL_INPUT, MoneyInput, PHONE_INPUT, emailRule, ifscRule, panRule, phoneRule, upper } from '@/components/form/inputs';
import { MasterInput } from '@/components/masters/MasterInput';

interface FormValues {
  employeeCode?: string;
  fullName: string;
  designation: string;
  department?: string;
  phone?: string;
  userId?: string | null;
  projectId?: string | null;
  joinedOn?: dayjs.Dayjs | null;
  leftOn?: dayjs.Dayjs | null;
  employmentType?: EmploymentType | null;
  grade?: string;
  reportingToId?: string | null;
  probationEndsOn?: dayjs.Dayjs | null;
  noticeDays?: number | null;
  ctcAnnual?: number | null;
  dateOfBirth?: dayjs.Dayjs | null;
  gender?: Gender | null;
  fatherOrSpouseName?: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  pan?: string;
  aadhaarLast4?: string;
  uan?: string;
  pfNumber?: string;
  esiNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
}

const day = (d: string | null | undefined) => (d ? dayjs(d) : null);
const ymd = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);
const DATE = { style: { width: '100%' }, format: 'DD MMM YYYY' } as const;

/**
 * Add a staff member or change one (v6 item 99: the full HR record). Job and terms for everyone who keeps staff; the
 * personal, statutory and bank sections for staff admins and payroll. The last working day marks them as left; an exit
 * with its letter is recorded from the record's Service tab instead.
 */
export function EmployeeFormModal({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee?: EmployeeDto | null; onSaved?: (e: EmployeeDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: users } = useLinkableUsers(employee?.id, open);
  const { data: people } = useEmployees({ pageSize: 500 }, open);
  const editing = !!employee;
  const privateOk = !!user && canViewEmployeePrivate(user.roleKey);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (employee) {
      const p = employee.private;
      form.setFieldsValue({
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        designation: employee.designation,
        department: employee.department ?? undefined,
        phone: employee.phone ?? undefined,
        userId: employee.userId,
        projectId: employee.projectId,
        joinedOn: day(employee.joinedOn),
        leftOn: day(employee.leftOn),
        employmentType: employee.employmentType,
        grade: employee.grade ?? undefined,
        reportingToId: employee.reportingToId,
        probationEndsOn: day(employee.probationEndsOn),
        noticeDays: employee.noticeDays,
        ...(p
          ? {
              ctcAnnual: p.ctcAnnual ? Number(p.ctcAnnual) : null,
              dateOfBirth: day(p.dateOfBirth),
              gender: p.gender,
              fatherOrSpouseName: p.fatherOrSpouseName ?? undefined,
              email: p.email ?? undefined,
              address: p.address ?? undefined,
              bloodGroup: p.bloodGroup ?? undefined,
              emergencyContact: p.emergencyContact ?? undefined,
              emergencyPhone: p.emergencyPhone ?? undefined,
              pan: p.pan ?? undefined,
              aadhaarLast4: p.aadhaarLast4 ?? undefined,
              uan: p.uan ?? undefined,
              pfNumber: p.pfNumber ?? undefined,
              esiNumber: p.esiNumber ?? undefined,
              bankName: p.bankName ?? undefined,
              bankAccountNo: p.bankAccountNo ?? undefined,
              bankIfsc: p.bankIfsc ?? undefined,
            }
          : {}),
      });
    }
  }, [open, employee, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body: Record<string, unknown> = {
        employeeCode: v.employeeCode?.trim() || undefined,
        fullName: v.fullName.trim(),
        designation: v.designation.trim(),
        department: t(v.department),
        phone: t(v.phone),
        userId: v.userId ?? null,
        projectId: v.projectId ?? null,
        joinedOn: ymd(v.joinedOn),
        employmentType: v.employmentType ?? null,
        grade: t(v.grade),
        reportingToId: v.reportingToId ?? null,
        probationEndsOn: ymd(v.probationEndsOn),
        noticeDays: v.noticeDays ?? null,
      };
      if (privateOk)
        Object.assign(body, {
          ctcAnnual: v.ctcAnnual ?? null,
          dateOfBirth: ymd(v.dateOfBirth),
          gender: v.gender ?? null,
          fatherOrSpouseName: t(v.fatherOrSpouseName),
          email: t(v.email),
          address: t(v.address),
          bloodGroup: t(v.bloodGroup),
          emergencyContact: t(v.emergencyContact),
          emergencyPhone: t(v.emergencyPhone),
          pan: t(v.pan),
          aadhaarLast4: t(v.aadhaarLast4),
          uan: t(v.uan),
          pfNumber: t(v.pfNumber),
          esiNumber: t(v.esiNumber),
          bankName: t(v.bankName),
          bankAccountNo: t(v.bankAccountNo),
          bankIfsc: t(v.bankIfsc),
        });
      return employee
        ? (await api.patch<EmployeeDto>(`/staff/employees/${employee.id}`, { ...body, leftOn: ymd(v.leftOn) })).data
        : (await api.post<EmployeeDto>('/staff/employees', body)).data;
    },
    onSuccess: (e) => {
      message.success(editing ? `${e.fullName} updated` : `${e.fullName} added as ${e.employeeCode}`);
      qc.invalidateQueries({ queryKey: ['staff'] });
      onSaved?.(e);
    },
    meta: FAIL_NOTICE,
  });

  const managers = (people?.items ?? []).filter((p) => p.id !== employee?.id).map((p) => ({ value: p.id, label: `${p.fullName} (${p.employeeCode}, ${p.designation})` }));

  return (
    // Blank Posted at is head office, so the header's project is not put in.
    <FormShell open={open} onClose={onClose} form={form} layout="drawer" width={760} title={employee ? `Edit ${employee.fullName}` : 'New staff member'} okText="Save" onSubmit={(v) => mutation.mutateAsync(v)} projectDefault={false}>
      <Form form={form} layout="vertical">
        <FormSection title="Job">
          <FormGrid cols={2}>
            <Form.Item name="fullName" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name' }]}>
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="employeeCode" label="Code" extra={editing ? undefined : 'Next EMP- number when blank'} rules={editing ? [{ required: true, whitespace: true, message: 'Enter the code, e.g. EMP-022' }] : []}>
              <Input maxLength={30} placeholder="EMP-022" {...CODE_INPUT} />
            </Form.Item>
            <Form.Item name="designation" label="Designation" rules={[{ required: true, whitespace: true, message: 'Enter the designation, e.g. Site supervisor' }]}>
              <MasterInput list="designation" maxLength={80} placeholder="Site supervisor" />
            </Form.Item>
            <Form.Item name="department" label="Department">
              <MasterInput list="department" maxLength={80} placeholder="Execution" />
            </Form.Item>
            <Form.Item name="projectId" label="Posted at" extra="Blank for head office">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Head office" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
            </Form.Item>
            <Form.Item name="reportingToId" label="Reports to">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Nobody" options={managers} />
            </Form.Item>
            <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
              <Input {...PHONE_INPUT} />
            </Form.Item>
            <Form.Item name="userId" label="Login" extra="Lets them mark in and out, apply for leave and see their own record">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="No login" options={(users ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.email}, ${u.roleName})` }))} />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Terms">
          <FormGrid cols={2}>
            <Form.Item name="employmentType" label="Employment">
              <Select allowClear placeholder="Not set" options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] }))} />
            </Form.Item>
            <Form.Item name="grade" label="Grade">
              <Input maxLength={20} placeholder="M1" {...CODE_INPUT} />
            </Form.Item>
            <Form.Item name="joinedOn" label="Joined on" extra={editing ? undefined : 'Records the joining, with its appointment letter'}>
              <DatePicker {...DATE} />
            </Form.Item>
            <Form.Item name="probationEndsOn" label="Probation ends on">
              <DatePicker {...DATE} />
            </Form.Item>
            <Form.Item name="noticeDays" label="Notice period">
              <InputNumber min={0} max={180} precision={0} suffix="days" style={{ width: '100%' }} />
            </Form.Item>
            {privateOk && (
              <Form.Item name="ctcAnnual" label="Cost to company a year" extra={editing ? 'Later changes go through an increment on the Service and letters tab' : undefined}>
                <MoneyInput />
              </Form.Item>
            )}
            {editing && (
              <Form.Item name="leftOn" label="Last working day" extra="Marks them as left. To print a relieving letter, record the exit on the Service and letters tab.">
                <DatePicker {...DATE} />
              </Form.Item>
            )}
          </FormGrid>
        </FormSection>
        {privateOk && (
          <>
            <FormSection title="Personal">
              <FormGrid cols={2}>
                <Form.Item name="dateOfBirth" label="Date of birth">
                  <DatePicker {...DATE} disabledDate={(d) => d.isAfter(dayjs().subtract(14, 'year'))} />
                </Form.Item>
                <Form.Item name="gender" label="Gender">
                  <Select allowClear options={GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))} />
                </Form.Item>
                <Form.Item name="fatherOrSpouseName" label="Father's or spouse's name">
                  <Input maxLength={120} />
                </Form.Item>
                <Form.Item name="bloodGroup" label="Blood group">
                  <Select allowClear options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({ value: b, label: b }))} />
                </Form.Item>
                <Form.Item name="email" label="Personal email" rules={[emailRule]}>
                  <Input {...EMAIL_INPUT} maxLength={160} />
                </Form.Item>
                <Form.Item name="emergencyPhone" label="Emergency phone" rules={[phoneRule]}>
                  <Input {...PHONE_INPUT} />
                </Form.Item>
              </FormGrid>
              <Form.Item name="emergencyContact" label="Emergency contact" extra="Who to call, and how they are related">
                <Input maxLength={120} placeholder="Sunita Behera, wife" />
              </Form.Item>
              <Form.Item name="address" label="Address">
                <Input.TextArea rows={2} maxLength={400} />
              </Form.Item>
            </FormSection>
            <FormSection title="Statutory numbers">
              <FormGrid cols={2}>
                <Form.Item name="pan" label="PAN" normalize={upper} rules={[panRule]}>
                  <Input maxLength={10} placeholder="ABCDE1234F" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name="aadhaarLast4" label="Aadhaar, last four digits" extra="Only the last four digits are kept" rules={[{ pattern: /^\d{4}$/, message: 'Enter the last four digits only' }]}>
                  <Input maxLength={4} inputMode="numeric" placeholder="1234" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name="uan" label="UAN" rules={[{ pattern: UAN_PATTERN, message: 'The UAN is 12 digits, from the PF passbook' }]}>
                  <Input maxLength={12} inputMode="numeric" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name="pfNumber" label="PF number" normalize={upper}>
                  <Input maxLength={40} placeholder="OR/BBS/0012345/000/0000123" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name="esiNumber" label="ESI number" rules={[{ pattern: ESI_PATTERN, message: 'The ESI number is 10 digits (17 on older cards)' }]}>
                  <Input maxLength={17} inputMode="numeric" {...CODE_INPUT} />
                </Form.Item>
              </FormGrid>
            </FormSection>
            <FormSection title="Salary account">
              <FormGrid cols={2}>
                <Form.Item name="bankName" label="Bank">
                  <Input maxLength={80} placeholder="State Bank of India" />
                </Form.Item>
                <Form.Item name="bankIfsc" label="IFSC" normalize={upper} rules={[ifscRule]}>
                  <Input maxLength={11} placeholder="SBIN0001234" {...CODE_INPUT} />
                </Form.Item>
                <Form.Item name="bankAccountNo" label="Account number" rules={[{ pattern: /^\d{6,18}$/, message: 'The account number is 6 to 18 digits' }]}>
                  <Input maxLength={18} inputMode="numeric" {...CODE_INPUT} />
                </Form.Item>
              </FormGrid>
            </FormSection>
          </>
        )}
      </Form>
    </FormShell>
  );
}
