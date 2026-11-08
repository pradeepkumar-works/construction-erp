'use client';

import React, { useEffect } from 'react';
import { Button, Form, Input, InputNumber, Select, Switch } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IS_CLAUSE_CHECKS,
  IS_CLAUSE_CHECK_LABELS,
  IS_DISCIPLINES,
  IS_DISCIPLINE_LABELS,
  isStandardCode,
  isStandardLabel,
  isStandardProblem,
  type IsClauseCheckBy,
  type IsDiscipline,
  type IsStandardDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useTestTypes } from '@/lib/queries';
import { todayDate } from '@/lib/format';
import { DeleteOutlined, PlusOutlined } from '@/components/common/icons';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';

interface ClauseForm {
  ref?: string;
  title: string;
  requirement: string;
  by: IsClauseCheckBy;
  testTypeCode?: string;
  sampling?: string;
  tolerance?: string;
}

interface StandardForm {
  number: string;
  year: number;
  reaffirmed?: number | null;
  title: string;
  discipline: IsDiscipline;
  subject: string;
  active: boolean;
  clauses: ClauseForm[];
}

const blank = (v?: string | null) => v?.trim() || null;

/** A standard's form: a catalogue standard's copy (its number stays) or one of the company's own. */
export function IsStandardForm({ editing, onClose, codes }: { editing: IsStandardDto | 'new' | null; onClose: () => void; codes: string[] }) {
  const [form] = Form.useForm<StandardForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: types } = useTestTypes();
  const standard = editing && editing !== 'new' ? editing : null;
  const thisYear = Number(todayDate().slice(0, 4));

  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(
      standard
        ? {
            ...standard,
            clauses: standard.clauses.map((c) => ({
              ref: c.ref ?? '',
              title: c.title,
              requirement: c.requirement,
              by: c.check.by,
              testTypeCode: c.check.by === 'TEST' ? c.check.testTypeCode : undefined,
              sampling: c.sampling ?? '',
              tolerance: c.tolerance ?? '',
            })),
          }
        : { number: 'IS ', discipline: 'CIVIL', active: true, clauses: [{ title: '', requirement: '', by: 'TEST' }] },
    );
  }, [editing, standard, form]);

  const save = useMutation({
    mutationFn: async (v: StandardForm) => {
      const number = (standard?.number ?? v.number).trim();
      const body = {
        number,
        year: v.year,
        reaffirmed: v.reaffirmed ?? null,
        title: v.title.trim(),
        discipline: v.discipline,
        subject: v.subject.trim(),
        active: v.active,
        clauses: (v.clauses ?? []).map((c) => ({
          ref: blank(c.ref),
          title: c.title.trim(),
          requirement: c.requirement.trim(),
          check: c.by === 'TEST' ? { by: 'TEST' as const, testTypeCode: c.testTypeCode ?? '' } : { by: c.by },
          sampling: blank(c.sampling),
          tolerance: blank(c.tolerance),
        })),
      };
      const problem = isStandardProblem(body, (types ?? []).map((t) => t.code), thisYear);
      if (problem) throw new Error(problem);
      const code = standard?.code ?? isStandardCode(number);
      return (await api.put<IsStandardDto>(`/is-standards/${encodeURIComponent(code)}`, body)).data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['quality', 'is-standards'] });
      notify.saved(`${isStandardLabel(s)} saved`, `/is-standards/${s.code}`);
    },
    meta: FAIL_NOTICE,
  });

  const typeOptions = (types ?? []).map((t) => ({ value: t.code, label: `${t.name}${t.method ? ` (${t.method})` : ''}` }));

  return (
    <FormShell
      open={!!editing}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={720}
      projectDefault={false}
      title={standard ? `Edit ${isStandardLabel(standard)}` : 'New standard'}
      okText="Save"
      onSubmit={(v) => save.mutateAsync(v)}
    >
      <Form form={form} layout="vertical">
        <FormSection title="The standard">
          <FormGrid cols={3}>
            <Form.Item
              name="number"
              label="Number"
              tooltip={standard ? 'A catalogue standard keeps its number; add your own for another' : 'As BIS writes it, without the year'}
              rules={
                standard
                  ? []
                  : [
                      { required: true, whitespace: true, message: 'Give the number, such as IS 456' },
                      { pattern: /^IS\s+\d+/i, message: 'Start with IS and the number, such as IS 2720 (Part 8)' },
                      { validator: (_, v: string) => (v && codes.includes(isStandardCode(v)) ? Promise.reject(new Error('That standard is in the library already; edit it there')) : Promise.resolve()) },
                    ]
              }
            >
              <Input maxLength={60} disabled={!!standard} translate="no" />
            </Form.Item>
            <Form.Item name="year" label="Edition" rules={[{ required: true, message: "Give the edition's year" }]}>
              <InputNumber min={1947} max={thisYear} precision={0} style={{ width: '100%' }} placeholder="2000" />
            </Form.Item>
            <Form.Item name="reaffirmed" label="Reaffirmed">
              <InputNumber min={1947} max={thisYear} precision={0} style={{ width: '100%' }} placeholder="2021" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, message: 'Give the title' }]}>
            <Input maxLength={300} placeholder="Plain and reinforced concrete: code of practice" />
          </Form.Item>
          <FormGrid cols={3}>
            <Form.Item name="discipline" label="Discipline" rules={[{ required: true, message: 'Choose the discipline' }]}>
              <Select options={IS_DISCIPLINES.map((d) => ({ value: d, label: IS_DISCIPLINE_LABELS[d] }))} />
            </Form.Item>
            <Form.Item name="subject" label="Subject" rules={[{ required: true, whitespace: true, message: 'Say what it is about, such as Concrete' }]}>
              <Input maxLength={80} placeholder="Concrete" />
            </Form.Item>
            <Form.Item name="active" label="Tracked" valuePropName="checked" tooltip="A standard not tracked leaves the library's list and compliance">
              <Switch />
            </Form.Item>
          </FormGrid>
        </FormSection>
        <Form.List name="clauses">
          {(fields, { add, remove }) => (
            <>
              {fields.map((f, i) => (
                <FormSection
                  key={f.key}
                  title={`Clause ${i + 1}`}
                  extra={<Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove clause ${i + 1}`} onClick={() => remove(f.name)} />}
                >
                  <FormGrid cols={3}>
                    <Form.Item name={[f.name, 'ref']} label="Clause or table">
                      <Input maxLength={40} placeholder="15.2.2" translate="no" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'by']} label="Proved by" rules={[{ required: true, message: `Choose how clause ${i + 1} is proved` }]}>
                      <Select options={IS_CLAUSE_CHECKS.map((c) => ({ value: c, label: IS_CLAUSE_CHECK_LABELS[c] }))} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(a, b) => a.clauses?.[f.name]?.by !== b.clauses?.[f.name]?.by}>
                      {() =>
                        form.getFieldValue(['clauses', f.name, 'by']) === 'TEST' ? (
                          <Form.Item name={[f.name, 'testTypeCode']} label="Test" rules={[{ required: true, message: `Choose the test that proves clause ${i + 1}` }]}>
                            <Select showSearch={{ optionFilterProp: 'label' }} options={typeOptions} placeholder="Choose a test" />
                          </Form.Item>
                        ) : null
                      }
                    </Form.Item>
                  </FormGrid>
                  <Form.Item name={[f.name, 'title']} label="Title" rules={[{ required: true, whitespace: true, message: `Give clause ${i + 1} a title` }]}>
                    <Input maxLength={120} placeholder="Frequency of sampling" />
                  </Form.Item>
                  <Form.Item name={[f.name, 'requirement']} label="What it asks" rules={[{ required: true, whitespace: true, message: `Say what clause ${i + 1} asks` }]}>
                    <Input.TextArea maxLength={1000} autoSize={{ minRows: 2, maxRows: 6 }} />
                  </Form.Item>
                  <FormGrid cols={2}>
                    <Form.Item name={[f.name, 'sampling']} label="How often">
                      <Input maxLength={300} placeholder="Every lot received" />
                    </Form.Item>
                    <Form.Item name={[f.name, 'tolerance']} label="Tolerance">
                      <Input maxLength={300} placeholder="+10 mm, −0 mm" />
                    </Form.Item>
                  </FormGrid>
                </FormSection>
              ))}
              {fields.length < 40 ? (
                <Button icon={<PlusOutlined />} onClick={() => add({ title: '', requirement: '', by: 'TEST' })}>
                  Add clause
                </Button>
              ) : null}
            </>
          )}
        </Form.List>
      </Form>
    </FormShell>
  );
}
