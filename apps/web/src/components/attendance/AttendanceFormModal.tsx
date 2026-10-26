'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttendanceSheetDto } from '@erp/shared';
import { DEPARTMENTAL_CONTRACTOR, attendanceToManpower, canRecordAttendance, normalizeAttendanceLines, totalWorkers } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useAttendanceDay, useAttendanceSuggestions, useProjects } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { themeColor, themeFontSize } from '@/lib/theme';
import { FormShell } from '@/components/form/FormShell';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

interface LineValue {
  contractor?: string;
  category?: string;
  count?: number | null;
}

interface FormValues {
  projectId: string;
  date: dayjs.Dayjs;
  lines?: LineValue[];
  remarks?: string;
}

const DEFAULT_LINES: LineValue[] = [
  { contractor: DEPARTMENTAL_CONTRACTOR, category: 'Supervisor', count: null },
  { contractor: DEPARTMENTAL_CONTRACTOR, category: 'Helper', count: null },
];

const toLines = (v: LineValue[] | undefined) =>
  normalizeAttendanceLines((v ?? []).flatMap((l) => (l ? [{ contractor: l.contractor ?? '', category: l.category ?? '', count: Number(l.count) || 0 }] : [])));

/**
 * Record a day's attendance (head count by contractor and trade), or open an existing sheet to correct it.
 * Read-only for roles that cannot record attendance and once the day's DPR is approved.
 */
export function AttendanceFormModal({ open, onClose, projectId, sheet: initial }: { open: boolean; onClose: () => void; projectId?: string; sheet?: AttendanceSheetDto | null }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: projects } = useProjects();
  // The sheet being edited: the one opened from the list, or an existing one the user switched to.
  const [sheet, setSheet] = useState<AttendanceSheetDto | null>(null);
  const editing = !!sheet;
  const fixedProject = sheet?.projectId ?? projectId;

  const watchedProject = Form.useWatch('projectId', form);
  const watchedDate = Form.useWatch('date', form);
  const watchedLines = Form.useWatch('lines', form);
  const dayStr = watchedDate ? dayjs(watchedDate).format('YYYY-MM-DD') : undefined;
  const day = useAttendanceDay(open ? watchedProject : undefined, open ? dayStr : undefined);
  const suggestions = useAttendanceSuggestions(open ? (watchedProject ?? fixedProject) : undefined);

  const mayRecord = !!user && canRecordAttendance(user.roleKey);
  const locked = editing ? sheet.locked || (sheet.date === dayStr ? false : !!day.data?.locked) : !!day.data?.locked;
  const readOnly = !mayRecord || (editing && sheet.locked);
  // Creating, and the chosen day already has a sheet (someone else recorded it): offer to open that one.
  const existingForDay = !editing && day.data?.sheet ? day.data.sheet : null;
  const movedOnto = editing && dayStr && dayStr !== sheet.date && day.data?.sheet && day.data.sheet.id !== sheet.id ? day.data.sheet : null;

  const load = (s: AttendanceSheetDto | null) => {
    setSheet(s);
    form.resetFields();
    if (s) {
      form.setFieldsValue({
        projectId: s.projectId,
        date: dayjs(s.date),
        lines: s.lines.length ? s.lines.map((l) => ({ contractor: l.contractor, category: l.category, count: l.count })) : [{ contractor: DEPARTMENTAL_CONTRACTOR, count: null }],
        remarks: s.remarks ?? undefined,
      });
    } else {
      form.setFieldsValue({ projectId, date: dayjs(), lines: DEFAULT_LINES });
    }
  };

  useEffect(() => {
    if (open) load(initial ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is new each render; this fills the form when it opens or its sheet or project changes
  }, [open, initial, projectId]);

  const clean = useMemo(() => toLines(watchedLines), [watchedLines]);
  const total = totalWorkers(clean);
  const byTrade = attendanceToManpower(clean);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body = { date: v.date.format('YYYY-MM-DD'), lines: toLines(v.lines), remarks: v.remarks?.trim() || null };
      return sheet
        ? (await api.patch<AttendanceSheetDto>(`/attendance/${sheet.id}`, body)).data
        : (await api.post<AttendanceSheetDto>('/attendance', { projectId: v.projectId, ...body })).data;
    },
    onSuccess: (s) => {
      message.success(`Attendance saved: ${s.totalWorkers} workers on ${formatDate(s.date)}`);
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    meta: FAIL_NOTICE,
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/attendance/${sheet!.id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  const contractorOptions = (suggestions.data?.contractors ?? [DEPARTMENTAL_CONTRACTOR]).map((c) => ({ value: c }));
  const categoryOptions = (suggestions.data?.categories ?? []).map((c) => ({ value: c }));
  const blocked = readOnly || locked || !!existingForDay || !!movedOnto;

  const title = editing ? `Attendance · ${formatDate(sheet.date)}` : 'Record attendance';
  const deleteButton = editing ? (
    <ConfirmDelete what={`the attendance sheet for ${formatDate(sheet.date)}`} onConfirm={() => remove.mutateAsync()} disabled={locked}>
      <Button danger icon={<DeleteOutlined />} loading={remove.isPending} disabled={locked}>
        Delete
      </Button>
    </ConfirmDelete>
  ) : null;

  const body = (
    <Form form={form} layout="vertical" disabled={readOnly} style={{ marginTop: 8 }}>
      {editing && sheet.locked ? (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Locked: the DPR for this day is approved." />
      ) : !editing && locked ? (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="The DPR for this day is already approved, so attendance can no longer be recorded for it." />
      ) : null}
      {existingForDay ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title={`Attendance for ${formatDate(existingForDay.date)} is already recorded (${existingForDay.totalWorkers} workers, by ${existingForDay.recordedByName}).`}
          action={
            <Button size="small" onClick={() => load(existingForDay)}>
              Open it
            </Button>
          }
        />
      ) : null}
      {movedOnto ? <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={`${formatDate(movedOnto.date)} already has its own sheet. Pick another date.`} /> : null}

      <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]} hidden={!!fixedProject}>
        <Select showSearch={{ optionFilterProp: 'label' }} placeholder="Select project" options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))} />
      </Form.Item>
      <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick the date' }]} style={{ maxWidth: 240 }}>
        <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
      </Form.Item>

      <Form.Item label="Workers on site" required style={{ marginBottom: 8 }}>
        <Form.List name="lines">
          {(fields, { add, remove: removeLine }) => (
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 6, color: themeColor('colorTextDescription'), fontSize: themeFontSize('fontSizeSM') }}>
                <span style={{ flex: 3 }}>Contractor</span>
                <span style={{ flex: 2 }}>Trade</span>
                <span style={{ width: 90 }}>Workers</span>
                <span style={{ width: 32 }} />
              </div>
              {fields.map((f, i) => (
                <div key={f.key} style={{ display: 'flex', gap: 6 }} data-line-label={`Workers on site, line ${i + 1}`}>
                  <Form.Item name={[f.name, 'contractor']} noStyle rules={[{ required: true, whitespace: true, message: '' }]}>
                    <AutoComplete style={{ flex: 3 }} options={contractorOptions} placeholder="Contractor" showSearch={{ filterOption: (input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'category']} noStyle rules={[{ required: true, whitespace: true, message: '' }]}>
                    <AutoComplete style={{ flex: 2 }} options={categoryOptions} placeholder="Trade" showSearch={{ filterOption: (input, o) => (o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }} />
                  </Form.Item>
                  <Form.Item name={[f.name, 'count']} noStyle rules={[{ required: true, message: '' }]}>
                    <InputNumber min={0} precision={0} inputMode="numeric" placeholder="Nos" style={{ width: 90 }} />
                  </Form.Item>
                  <Button icon={<DeleteOutlined />} onClick={() => removeLine(f.name)} aria-label="Remove row" />
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                size="small"
                block
                onClick={() => {
                  const last = (form.getFieldValue('lines') as LineValue[] | undefined)?.at(-1);
                  add({ contractor: last?.contractor ?? DEPARTMENTAL_CONTRACTOR, count: null });
                }}
              >
                Add row
              </Button>
            </Space>
          )}
        </Form.List>
      </Form.Item>

      <div style={{ background: themeColor('colorFillAlter'), border: `1px solid ${themeColor('colorBorderSecondary')}`, borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
        <Typography.Text strong>Total {total} workers</Typography.Text>
        {byTrade.length ? (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM'), marginRight: 4 }}>
              Fills the DPR manpower:
            </Typography.Text>
            {byTrade.map((m) => (
              <AppTag key={m.category} style={{ margin: 0 }}>
                {m.category} {m.count}
              </AppTag>
            ))}
          </div>
        ) : null}
      </div>

      <Form.Item name="remarks" label="Remarks" extra="Use this for a day with no workers, e.g. Holiday or Strike.">
        <Input.TextArea rows={2} maxLength={1000} />
      </Form.Item>
      {editing ? (
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          Recorded by {sheet.recordedByName}
          {sheet.updatedByName ? `, last changed by ${sheet.updatedByName}` : ''}.
        </Typography.Text>
      ) : null}
    </Form>
  );

  // Read-only (a role that cannot record attendance, or a locked sheet) is a plain view with Close.
  if (readOnly) {
    return (
      <Modal open={open} title={title} onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} width={720} destroyOnHidden styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}>
        {body}
      </Modal>
    );
  }
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" width={720} title={title} okText="Save attendance" okDisabled={blocked} footerExtra={deleteButton} onSubmit={(v) => save.mutateAsync(v)}>
      {body}
    </FormShell>
  );
}
