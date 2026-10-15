'use client';

import React, { useEffect } from 'react';
import { App, AutoComplete, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkerDto, WorkerIdType, WorkerSkill } from '@erp/shared';
import { WORKER_ID_TYPES, WORKER_ID_TYPE_LABELS, WORKER_SKILLS, WORKER_SKILL_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAttendanceSuggestions } from '@/lib/queries';
import { ProjectSelect } from '@/components/common/ProjectSelect';

interface Values {
  name: string;
  fatherName?: string;
  phone?: string;
  contractor: string;
  trade: string;
  skill: WorkerSkill;
  idType?: WorkerIdType | null;
  idNumber?: string;
  dailyWage?: number | null;
  otRate?: number | null;
  projectId?: string | null;
  joinedOn?: dayjs.Dayjs | null;
  leftOn?: dayjs.Dayjs | null;
}

const ymd = (d?: dayjs.Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null);

/** Add a named worker, or edit one: move them to another project, change the wage or mark them as left. */
export function WorkerFormModal({ open, onClose, worker, projectId }: { open: boolean; onClose: () => void; worker?: WorkerDto | null; projectId?: string }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const project = Form.useWatch('projectId', form);
  const idType = Form.useWatch('idType', form);
  const suggestions = useAttendanceSuggestions(open ? (project ?? projectId) : undefined);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (worker)
      form.setFieldsValue({
        name: worker.name,
        fatherName: worker.fatherName ?? undefined,
        phone: worker.phone ?? undefined,
        contractor: worker.contractor,
        trade: worker.trade,
        skill: worker.skill,
        idType: worker.idType,
        idNumber: undefined,
        dailyWage: Number(worker.dailyWage),
        otRate: worker.otRate === null ? null : Number(worker.otRate),
        projectId: worker.projectId,
        joinedOn: worker.joinedOn ? dayjs(worker.joinedOn) : null,
        leftOn: worker.leftOn ? dayjs(worker.leftOn) : null,
      });
    else form.setFieldsValue({ skill: 'UNSKILLED', projectId: projectId ?? null, joinedOn: dayjs() });
  }, [open, worker, projectId, form]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const body = {
        name: v.name,
        fatherName: v.fatherName || null,
        phone: v.phone || null,
        contractor: v.contractor,
        trade: v.trade,
        skill: v.skill,
        idType: v.idType ?? null,
        ...(v.idNumber ? { idNumber: v.idNumber } : worker ? {} : { idNumber: null }),
        ...(v.dailyWage !== null && v.dailyWage !== undefined ? { dailyWage: String(v.dailyWage) } : {}),
        otRate: v.otRate === null || v.otRate === undefined ? null : String(v.otRate),
        projectId: v.projectId ?? null,
        joinedOn: ymd(v.joinedOn),
      };
      if (!worker) return (await api.post<WorkerDto>('/workers', body)).data;
      const left = ymd(v.leftOn);
      return (await api.patch<WorkerDto>(`/workers/${worker.id}`, { ...body, leftOn: left, ...(left ? {} : { isActive: true }) })).data;
    },
    onSuccess: (w) => {
      message.success(worker ? 'Worker saved' : `Worker ${w.workerNo} added`);
      qc.invalidateQueries({ queryKey: ['workers'] });
      onClose();
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  return (
    <Modal
      open={open}
      title={worker ? `${worker.workerNo} ${worker.name}` : 'Add a worker'}
      okText={worker ? 'Save' : 'Add worker'}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={save.isPending}
      destroyOnHidden
      width={640}
    >
      <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} requiredMark="optional">
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name' }]}>
              <Input maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="fatherName" label="Father's name">
              <Input maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="contractor" label="Labour contractor" rules={[{ required: true, whitespace: true, message: 'Enter the contractor, or Departmental' }]}>
              <AutoComplete options={(suggestions.data?.contractors ?? []).map((c) => ({ value: c }))} showSearch={{ filterOption: (i, o) => String(o?.value).toLowerCase().includes(i.toLowerCase()) }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="trade" label="Trade" rules={[{ required: true, whitespace: true, message: 'Enter the trade' }]}>
              <AutoComplete options={(suggestions.data?.categories ?? []).map((c) => ({ value: c }))} showSearch={{ filterOption: (i, o) => String(o?.value).toLowerCase().includes(i.toLowerCase()) }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="skill" label="Skill">
              <Select options={WORKER_SKILLS.map((s) => ({ value: s, label: WORKER_SKILL_LABELS[s] }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="dailyWage" label="Daily wage (₹)" extra={worker ? undefined : 'Empty: the labour rate of the trade'}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="otRate" label="OT per hour (₹)" extra="Empty: daily wage / 8">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="idType" label="ID">
              <Select allowClear options={WORKER_ID_TYPES.map((t) => ({ value: t, label: WORKER_ID_TYPE_LABELS[t] }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              name="idNumber"
              label="ID number"
              extra={idType === 'AADHAAR' ? 'Only the last four digits are kept' : worker?.idNumber ? `On file: ${worker.idNumber}` : undefined}
            >
              <Input maxLength={40} placeholder={worker?.idNumber ?? undefined} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="phone" label="Phone">
              <Input maxLength={20} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="projectId" label="Working at">
              <ProjectSelect placeholder="Not posted to a project" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="joinedOn" label="Joined on">
              <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          {worker ? (
            <Col xs={12} sm={6}>
              <Form.Item name="leftOn" label="Left on" extra="Takes them off the roll call">
                <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          ) : null}
        </Row>
      </Form>
    </Modal>
  );
}
