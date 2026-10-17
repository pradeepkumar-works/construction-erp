'use client';

import React, { useEffect } from 'react';
import { App, DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import type { EmployeeDto } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useLinkableUsers, useProjects } from '@/lib/queries';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { PHONE_INPUT, phoneRule } from '@/components/form/inputs';

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
}

/** Add a staff member or change one; the last working day marks them as left. */
export function EmployeeFormModal({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee?: EmployeeDto | null; onSaved?: (e: EmployeeDto) => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  const { data: users } = useLinkableUsers(employee?.id, open);
  const editing = !!employee;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (employee)
      form.setFieldsValue({
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        designation: employee.designation,
        department: employee.department ?? undefined,
        phone: employee.phone ?? undefined,
        userId: employee.userId,
        projectId: employee.projectId,
        joinedOn: employee.joinedOn ? dayjs(employee.joinedOn) : null,
        leftOn: employee.leftOn ? dayjs(employee.leftOn) : null,
      });
  }, [open, employee, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const t = (x: string | undefined) => x?.trim() || (editing ? null : undefined);
      const body = {
        employeeCode: v.employeeCode?.trim() || undefined,
        fullName: v.fullName.trim(),
        designation: v.designation.trim(),
        department: t(v.department),
        phone: t(v.phone),
        userId: v.userId ?? null,
        projectId: v.projectId ?? null,
        joinedOn: v.joinedOn ? v.joinedOn.format('YYYY-MM-DD') : null,
      };
      return employee
        ? (await api.patch<EmployeeDto>(`/staff/employees/${employee.id}`, { ...body, leftOn: v.leftOn ? v.leftOn.format('YYYY-MM-DD') : null })).data
        : (await api.post<EmployeeDto>('/staff/employees', body)).data;
    },
    onSuccess: (e) => {
      message.success(editing ? `${e.fullName} updated` : `${e.fullName} added as ${e.employeeCode}`);
      qc.invalidateQueries({ queryKey: ['staff'] });
      onSaved?.(e);
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    // Blank Posted at is head office, so the header's project is not put in.
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={employee ? `Edit ${employee.fullName}` : 'Add staff'} okText={editing ? 'Save' : 'Add'} onSubmit={(v) => mutation.mutateAsync(v)} projectDefault={false}>
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item name="fullName" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name' }]}>
            <Input maxLength={120} />
          </Form.Item>
          <Form.Item name="employeeCode" label="Code" extra={editing ? undefined : 'Next EMP- number when blank'} rules={editing ? [{ required: true, whitespace: true, message: 'Enter the code, e.g. EMP-022' }] : []}>
            <Input maxLength={30} placeholder="EMP-022" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="designation" label="Designation" rules={[{ required: true, whitespace: true, message: 'Enter the designation, e.g. Site supervisor' }]}>
            <Input maxLength={80} placeholder="Site supervisor" />
          </Form.Item>
          <Form.Item name="department" label="Department">
            <Input maxLength={80} placeholder="Execution" />
          </Form.Item>
        </FormGrid>
        <FormGrid cols={2}>
          <Form.Item name="projectId" label="Posted at" extra="Blank for head office">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Head office" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
          </Form.Item>
          <Form.Item name="phone" label="Phone" rules={[phoneRule]}>
            <Input {...PHONE_INPUT} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="userId" label="Login" extra="Linking a login lets them check in and apply for leave themselves">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="No login" options={(users ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.email}, ${u.roleName})` }))} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="joinedOn" label="Joined on">
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>
          {editing && (
            <Form.Item name="leftOn" label="Last working day" extra="Marks them as left">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          )}
        </FormGrid>
      </Form>
    </FormShell>
  );
}
