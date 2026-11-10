'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Flex, Form, Input, Radio, Segmented, Select, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppTag } from '@/components/common/AppTag';
import { useIsPhone } from '@/lib/screen';
import type { LetterDirection, LetterGate, LetterSeriesDto, LetterSettingsDto } from '@erp/shared';
import {
  HEAD_OFFICE_PREFIX,
  LETTER_GATES,
  LETTER_GATE_LABELS,
  NO_LETTER_CATEGORY,
  isContractualCategory,
  letterGate,
  LETTER_DIRECTION_LABELS,
  LETTER_NUMBER_PATTERN,
  formatLetterNo,
  letterPatternProblem,
  letterPrefixOf,
  letterPrefixProblem,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useLetterSettings, useMasterList, useProjects } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { EditOutlined, PlusOutlined } from '@/components/common/icons';
import { CODE_INPUT } from '@/components/form/inputs';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { todayDate } from '@/lib/format';

const HO = 'HO';

/** The three gates as the choice reads beside a category. */
const GATE_WORDS: Record<LetterGate, string> = { NONE: 'None', SIGN: 'Signatory', SEAL: 'Signatory and seal' };

interface SeriesForm {
  projectId: string;
  direction: LetterDirection;
  prefix: string;
  pattern: string;
}

/** A series' prefix and pattern, with the number the next letter would get. */
function SeriesDialog({ editing, onClose }: { editing: LetterSeriesDto | 'new' | null; onClose: () => void }) {
  const [form] = Form.useForm<SeriesForm>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const series = editing && editing !== 'new' ? editing : null;
  const prefix = Form.useWatch('prefix', form) ?? '';
  const pattern = Form.useWatch('pattern', form) ?? '';
  const direction = Form.useWatch('direction', form) ?? 'IN';
  useEffect(() => {
    if (!editing) return;
    form.resetFields();
    form.setFieldsValue(series ? { projectId: series.projectId ?? HO, direction: series.direction, prefix: series.prefix, pattern: series.pattern } : { projectId: HO, direction: 'IN', prefix: HEAD_OFFICE_PREFIX, pattern: LETTER_NUMBER_PATTERN });
  }, [editing, series, form]);
  const problem = letterPatternProblem(pattern) ?? letterPrefixProblem(prefix.trim());
  const example = problem ? null : formatLetterNo(pattern, { prefix: prefix.trim(), direction, date: todayDate(), n: 42 });
  const save = useMutation({
    mutationFn: async (v: SeriesForm) =>
      series
        ? (await api.patch<LetterSeriesDto>(`/letters/series/${series.id}`, { prefix: v.prefix.trim(), pattern: v.pattern.trim() })).data
        : (await api.put<LetterSeriesDto>('/letters/series', { projectId: v.projectId === HO ? null : v.projectId, direction: v.direction, prefix: v.prefix.trim(), pattern: v.pattern.trim() })).data,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['letters', 'settings'] });
      notify.saved(`Next number ${s.next}`);
    },
    meta: FAIL_NOTICE,
  });
  return (
    <FormShell open={!!editing} onClose={onClose} form={form} layout="modal" width={560} projectDefault={false} title={series ? `${series.projectName ?? 'Head office'} · ${LETTER_DIRECTION_LABELS[series.direction]}` : 'New series'} okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {!series ? (
          <FormGrid cols={2}>
            <Form.Item name="projectId" label="For" rules={[{ required: true, message: 'Choose the project, or head office' }]}>
              <Select
                showSearch={{ optionFilterProp: 'label' }}
                options={[{ value: HO, label: 'Head office' }, ...(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))]}
                onChange={(v) => form.setFieldValue('prefix', v === HO ? HEAD_OFFICE_PREFIX : letterPrefixOf(projects?.find((p) => p.id === v)?.code ?? ''))}
              />
            </Form.Item>
            <Form.Item name="direction" label="Letters">
              <Radio.Group optionType="button" options={(['IN', 'OUT'] as const).map((d) => ({ value: d, label: LETTER_DIRECTION_LABELS[d] }))} />
            </Form.Item>
          </FormGrid>
        ) : null}
        <FormGrid cols={2}>
          <Form.Item name="prefix" label="Prefix" rules={[{ required: true, whitespace: true, message: 'Enter a short prefix such as P07' }]}>
            <Input {...CODE_INPUT} maxLength={20} />
          </Form.Item>
          <Form.Item name="pattern" label="Pattern" rules={[{ required: true, whitespace: true, message: 'Enter the pattern' }]}>
            <Input {...CODE_INPUT} maxLength={60} />
          </Form.Item>
        </FormGrid>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Parts: {'{PREFIX}'}, {'{DIR}'} (IN or OUT), {'{FY}'} (26-27) or {'{YYYY}'} (the year the financial year starts), and the running number {'{N}'}, {'{NN}'}, {'{NNN}'} or {'{NNNN}'}, padded with zeros. It starts again at 1 each financial year.
        </Typography.Paragraph>
        <Typography.Paragraph style={{ marginTop: tk.space[2], marginBottom: 0 }} type={problem ? 'danger' : undefined}>
          {problem ?? (
            <>
              The 42nd letter reads{' '}
              <span className="mono" translate="no">
                {example}
              </span>
            </>
          )}
        </Typography.Paragraph>
      </Form>
    </FormShell>
  );
}

/** Numbering and approval: which outward letters wait for their signatory, and each series' pattern. */
export function LetterNumbering() {
  const qc = useQueryClient();
  const notify = useNotify();
  const { data, isLoading, error, refetch } = useLetterSettings();
  const { data: categories } = useMasterList('letter-category');
  const [editing, setEditing] = useState<LetterSeriesDto | 'new' | null>(null);
  const phone = useIsPhone();
  const saveGate = useMutation({
    mutationFn: async (v: { category: string | null; gate: LetterGate }) => (await api.put<LetterSettingsDto>('/letters/settings/gate', v)).data,
    onSuccess: (s, v) => {
      qc.setQueryData(['letters', 'settings'], s);
      notify.success(`${v.category ? (categories?.entries.find((e) => e.code === v.category)?.name ?? v.category) : 'Letters with no category'}: ${LETTER_GATE_LABELS[v.gate].toLowerCase()}`);
    },
    meta: FAIL_NOTICE,
  });
  const rows = useMemo(
    () => [...(categories?.entries ?? []).filter((e) => e.isActive).map((e) => ({ code: e.code as string | null, name: e.name })), { code: null, name: 'Letters with no category' }],
    [categories],
  );

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const manage = data.canManage;

  return (
    <div className="page-container">
      <PageHeader
        title="Numbering and approval"
        help="Each project and head office numbers its letters in and out in its own series, starting again each financial year. Choose which outward letters wait for their signatory, and then for head office, before they get a number."
        extra={
          manage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New series
            </Button>
          ) : null
        }
      />
      <Flex vertical gap={tk.space[4]}>
        <Card title="Approval by category" size="small">
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            What an outward letter of each category passes before it gets its number: nothing, its signatory, or its signatory and then a director at head office, who seals it. A letter a director signs needs no seal.
          </Typography.Paragraph>
          <ul aria-label="Approval by category" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((r) => {
              const gate = letterGate(data, r.code);
              const pending = saveGate.isPending && saveGate.variables?.category === r.code;
              return (
                <li
                  key={r.code ?? NO_LETTER_CATEGORY}
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: tk.space[2], minHeight: 44, padding: `${tk.space[2]}px 0`, borderTop: `1px solid ${tk.color.line.hairline}` }}
                >
                  <span>
                    {r.name}
                    {isContractualCategory(r.code) ? (
                      <AppTag variant="kind" style={{ marginInlineStart: tk.space[2] }}>
                        Needs proof of delivery
                      </AppTag>
                    ) : null}
                  </span>
                  <Segmented<LetterGate>
                    size={phone ? 'small' : 'middle'}
                    value={gate}
                    disabled={!manage || pending}
                    aria-label={`Approval for ${r.name.toLowerCase()}`}
                    onChange={(g) => saveGate.mutate({ category: r.code, gate: g })}
                    options={LETTER_GATES.map((g) => ({ value: g, label: GATE_WORDS[g] }))}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Series" size="small">
          <Table<LetterSeriesDto>
            rowKey="id"
            size="middle"
            dataSource={data.series}
            pagination={false}
            scroll={{ x: 720 }}
            locale={{ emptyText: `No letters numbered yet. Each project starts with ${data.pattern} on its first letter.` }}
            columns={[
              { title: 'For', key: 'for', render: (_, s) => s.projectName ?? 'Head office' },
              { title: 'Letters', dataIndex: 'direction', width: 110, render: (d: LetterDirection) => LETTER_DIRECTION_LABELS[d] },
              { title: 'Pattern', key: 'pattern', render: (_, s) => <span className="mono" translate="no">{s.pattern.replace('{PREFIX}', s.prefix)}</span> },
              { title: 'Next number', dataIndex: 'next', render: (v: string) => <span className="mono" translate="no">{v}</span> },
              { title: 'This year', dataIndex: 'usedThisYear', width: 100, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
              ...(manage
                ? [
                    {
                      title: <span className="visually-hidden">Actions</span>,
                      key: 'edit',
                      width: 56,
                      render: (_: unknown, s: LetterSeriesDto) => <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${s.projectName ?? 'head office'} ${LETTER_DIRECTION_LABELS[s.direction].toLowerCase()}`} onClick={() => setEditing(s)} />,
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      </Flex>
      <SeriesDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
