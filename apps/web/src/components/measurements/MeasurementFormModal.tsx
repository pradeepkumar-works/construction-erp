'use client';

import React, { useEffect } from 'react';
import { Alert, Button, Checkbox, Form, Input, InputNumber, Select, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { AttachmentDto, MeasurementSheetDto } from '@erp/shared';
import { canViewWorkOrders, hasDimensions, measurementLineQty, measurementTotal } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useBoq, useProjects, useWorkOrders } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { SectorInputs, sectorBody, sectorFormValues, typedLocation, type SectorFormValues } from '@/components/sector/SectorInputs';
import { themeColor, themeFontSize } from '@/lib/theme';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { QuantityInput } from '@/components/form/inputs';
import { recordPage } from '@/components/approvals/queue';

export interface LineValues {
  description?: string;
  nos?: number | null;
  length?: number | null;
  breadth?: number | null;
  depth?: number | null;
  deduct?: boolean;
}

interface FormValues extends SectorFormValues {
  projectId: string;
  boqItemId: string;
  workOrderId?: string | null;
  date: dayjs.Dayjs;
  location?: string;
  remarks?: string;
  lines: LineValues[];
  photos?: AttachmentDto[];
}

const LINE_GRID = { display: 'grid', gridTemplateColumns: '2.4fr 0.8fr 1fr 1fr 1fr 0.9fr 1fr 32px', gap: '0 8px', alignItems: 'start' } as const;
const n = (v: string | null) => (v === null ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

/** Lines and remarks a new sheet starts with, e.g. measures taken off a drawing (item 118) or approved progress. */
export interface MeasurementPrefill {
  lines: LineValues[];
  remarks?: string;
  /** Where it was measured, when what filled the lines in knows */
  location?: string;
}

/** Record a measurement sheet against a BOQ item, or (with `sheet`) fix a returned one and resubmit it. */
export function MeasurementFormModal({
  open,
  onClose,
  projectId,
  boqItemId,
  sheet,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  boqItemId?: string;
  sheet?: MeasurementSheetDto | null;
  prefill?: MeasurementPrefill | null;
  onSaved?: (sheet: MeasurementSheetDto) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const editing = !!sheet;
  const fixedProject = sheet?.projectId ?? projectId;
  const selectedProject = Form.useWatch('projectId', form) ?? fixedProject;
  const { data: boq } = useBoq(selectedProject);
  const boqId = Form.useWatch('boqItemId', form);
  const item = boq?.find((b) => b.id === boqId);
  const lines = (Form.useWatch('lines', form) ?? []) as LineValues[];
  const total = measurementTotal(lines);
  const contractQty = item ? toNumber(item.revisedQty ?? item.originalQty) : 0;
  const { user } = useAuth();
  const seesWos = !!user && canViewWorkOrders(user.roleKey);
  const { data: wos } = useWorkOrders({ projectId: selectedProject, boqItemId: boqId, open: true, pageSize: 50 }, open && seesWos && !!selectedProject && !!boqId);
  const woOptions = (wos?.items ?? []).map((w) => ({ value: w.id, label: `${w.woNo} · ${w.vendorName}` }));
  if (sheet?.workOrderId && sheet.woNo && !woOptions.some((o) => o.value === sheet.workOrderId)) woOptions.push({ value: sheet.workOrderId, label: `${sheet.woNo} · ${sheet.contractorName ?? ''}` });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (sheet) {
      form.setFieldsValue({
        projectId: sheet.projectId,
        boqItemId: sheet.boqItemId,
        workOrderId: sheet.workOrderId,
        date: dayjs(sheet.date),
        location: typedLocation(sheet),
        ...sectorFormValues(sheet),
        remarks: sheet.remarks ?? undefined,
        lines: sheet.lines.map((l) => ({ description: l.description, nos: n(l.nos), length: n(l.length), breadth: n(l.breadth), depth: n(l.depth), deduct: l.deduct })),
        photos: sheet.attachments,
      });
    } else {
      form.setFieldsValue({ projectId, boqItemId, date: dayjs(), lines: prefill?.lines.length ? prefill.lines : [{ nos: 1 }], remarks: prefill?.remarks, location: prefill?.location });
    }
  }, [open, projectId, boqItemId, sheet, prefill, form]);

  const mutation = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = {
        boqItemId: v.boqItemId,
        workOrderId: v.workOrderId ?? (editing ? null : undefined),
        date: v.date.format('YYYY-MM-DD'),
        location: v.location?.trim() || (editing ? '' : undefined),
        ...sectorBody(v, editing),
        remarks: v.remarks?.trim() || (editing ? null : undefined),
        lines: v.lines.map((l) => ({ description: (l.description ?? '').trim(), nos: str(l.nos), length: str(l.length), breadth: str(l.breadth), depth: str(l.depth), deduct: !!l.deduct })),
        attachmentIds: (v.photos ?? []).map((p) => p.id),
        submit: true,
      };
      return sheet ? (await api.patch(`/measurements/${sheet.id}`, body)).data : (await api.post('/measurements', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (x: MeasurementSheetDto) => {
      notify.saved(editing ? `${x.mbNo} resubmitted for approval` : `${x.mbNo} submitted for approval`, recordPage('MEASUREMENT', x.id));
      qc.invalidateQueries();
      onSaved?.(x);
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={900}
      title={sheet ? `${editActionLabel(sheet.status)} · ${sheet.mbNo}` : 'New measurement'}
      okText={editing ? 'Resubmit for approval' : 'Submit'}
      onSubmit={(v) => mutation.mutateAsync(v)}
      // Lines filled in from elsewhere are not a draft of their own.
      draftKey={editing || prefill ? undefined : `measurement:${projectId ?? 'any'}`}
    >
      <Form form={form} layout="vertical">
        {sheet?.reviewNote && <Alert type="warning" showIcon style={{ marginBottom: 16 }} title={`Reviewer note from ${sheet.reviewedByName ?? 'approver'}`} description={sheet.reviewNote} />}
        <FormSection title="What and where">
          <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
            <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} onChange={() => form.setFieldsValue({ boqItemId: undefined, workOrderId: undefined })} />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item
              name="boqItemId"
              label="BOQ item"
              rules={[{ required: true, message: 'Choose the BOQ item' }]}
              extra={item ? `Contract ${formatQty(contractQty)} ${item.unit} · measured ${formatQty(item.measuredQty)} · awaiting approval ${formatQty(item.pendingMeasuredQty)}` : undefined}
            >
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Select BOQ item"
                disabled={!selectedProject}
                options={(boq ?? []).map((b) => ({ value: b.id, label: `${b.itemNo} - ${b.description} (${b.unit})` }))}
                onChange={() => form.setFieldValue('workOrderId', undefined)}
              />
            </Form.Item>
            <Form.Item name="date" label="Measured on" rules={[{ required: true, message: 'Pick the date' }]}>
              <DatePicker style={{ width: '100%' }} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </FormGrid>
          {woOptions.length > 0 && (
            <Form.Item name="workOrderId" label="Done by (work order)" extra="Tag the subcontractor's work so it goes in their bill. Leave empty for departmental work.">
              <Select allowClear placeholder="Departmental (no work order)" options={woOptions} />
            </Form.Item>
          )}
          <SectorInputs projectId={selectedProject} />
          <Form.Item
            name="location"
            label="Location"
            dependencies={['chainageFrom', 'floor', 'village']}
            rules={[
              ({ getFieldValue }) => ({
                validator: (_, v?: string) => (v?.trim() || getFieldValue('chainageFrom') || getFieldValue('floor') || getFieldValue('village') ? Promise.resolve() : Promise.reject(new Error('Enter the location, or a chainage, floor or village'))),
              }),
            ]}
          >
            <Input maxLength={200} placeholder="Grid, side or zone, e.g. LHS, grid C4-D7" />
          </Form.Item>
        </FormSection>
        <FormSection title="Measurements">
          <div style={{ ...LINE_GRID, fontSize: themeFontSize('fontSizeSM'), color: themeColor('colorTextDescription'), marginBottom: 4 }}>
            <span>Description</span>
            <span>Nos</span>
            <span>Length</span>
            <span>Breadth</span>
            <span>Depth / height</span>
            <span>Deduct</span>
            <span style={{ textAlign: 'right' }}>Qty {item ? `(${item.unit})` : ''}</span>
            <span />
          </div>
          <Form.List
            name="lines"
            rules={[
              {
                validator: async (_, v: LineValues[] | undefined) => {
                  if (!v?.length) throw new Error('Add at least one line');
                  if (measurementTotal(v) <= 0) throw new Error('The total must be greater than zero');
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((f) => {
                  const line = lines[f.name] ?? {};
                  const qty = measurementLineQty(line);
                  return (
                    <div key={f.key} style={LINE_GRID}>
                      <Form.Item name={[f.name, 'description']} rules={[{ required: true, whitespace: true, message: 'Describe the line' }]}>
                        <Input maxLength={200} placeholder="e.g. Footing F1" aria-label={`Line ${f.name + 1} description`} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'nos']}>
                        <InputNumber style={{ width: '100%' }} min={0} aria-label={`Line ${f.name + 1} nos`} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'length']}>
                        <QuantityInput aria-label={`Line ${f.name + 1} length`} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'breadth']}>
                        <QuantityInput aria-label={`Line ${f.name + 1} breadth`} />
                      </Form.Item>
                      <Form.Item
                        name={[f.name, 'depth']}
                        rules={[{ validator: async () => (hasDimensions(line) ? undefined : Promise.reject(new Error('Enter nos or a dimension'))) }]}
                      >
                        <QuantityInput aria-label={`Line ${f.name + 1} depth or height`} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'deduct']} valuePropName="checked">
                        <Checkbox aria-label={`Line ${f.name + 1} deduct`} />
                      </Form.Item>
                      <div className="mono" translate="no" style={{ textAlign: 'right', lineHeight: '32px', color: qty < 0 ? themeColor('colorErrorText') : undefined }}>
                        {formatQty(qty)}
                      </div>
                      <Button type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(f.name)} aria-label="Remove line" />
                    </div>
                  );
                })}
                <Form.ErrorList errors={errors} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 16px' }}>
                  <Button icon={<PlusOutlined />} onClick={() => add({ nos: 1 })} disabled={fields.length >= 100}>
                    Add line
                  </Button>
                  <Typography.Text strong style={{ fontSize: themeFontSize('fontSizeLG') }}>
                    Total {formatQty(total)} {item?.unit ?? ''}
                    {item ? <span className="text-muted" style={{ fontWeight: 400, fontSize: themeFontSize('fontSizeSM') }}> · {formatINR(total * toNumber(item.rate))}</span> : null}
                  </Typography.Text>
                </div>
              </>
            )}
          </Form.List>
          <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginTop: -8 }}>
            Each line is nos × length × breadth × depth; blank columns count as 1. Tick Deduct for openings and overlaps.
          </Typography.Paragraph>
        </FormSection>
        <FormSection title="Notes">
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item name="photos" label="Photos or sketch">
            <PhotoUpload />
          </Form.Item>
        </FormSection>
      </Form>
    </FormShell>
  );
}
