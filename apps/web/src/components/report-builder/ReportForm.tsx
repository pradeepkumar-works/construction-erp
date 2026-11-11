'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { App, Checkbox, Form, Input, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { MAX_REPORT_COLUMNS, MAX_REPORT_FILTERS, MAX_REPORT_NAME, REPORT_FILTER_OP_LABELS, filterOpsFor, type ReportCatalogueColumnDto, type ReportDefinition, type ReportFilterOp, type ReportSourceDto, type ReportSourceKey, type SavedReportDto } from '@erp/shared';
import { useReportSources, useSaveReport } from '@/lib/queries';
import { MONTH_PICKER_FORMAT } from '@/lib/format';
import { FormGrid, FormSection, FormShell, afterFormLeaves } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { DatePicker } from '@/components/common/DatePicker';
import { tk } from '@/ds';

interface FilterLine {
  column?: string;
  op?: ReportFilterOp;
  value?: string;
}

interface FormValues {
  name: string;
  shared?: boolean;
  source?: ReportSourceKey;
  columns: string[];
  groupBy?: string;
  totals: string[];
  sortColumn?: string;
  sortDesc?: boolean;
  filters: FilterLine[];
}

const startFrom = (s: ReportSourceDto): Partial<FormValues> => ({
  columns: s.starter.columns,
  groupBy: s.starter.groupBy ?? undefined,
  totals: s.starter.totals,
  sortColumn: undefined,
  sortDesc: false,
  filters: [],
});

/** A day or month field kept as its `YYYY-MM-DD` / `YYYY-MM` text. */
const asDay = (fmt: string) => ({
  getValueProps: (v?: string) => ({ value: v ? dayjs(fmt === 'YYYY-MM' ? `${v}-01` : v) : undefined }),
  normalize: (d?: Dayjs | null) => (d ? d.format(fmt) : undefined),
});

function FilterValue({ column, name }: { column: ReportCatalogueColumnDto | undefined; name: (string | number)[] }) {
  const label = column ? `Value for ${column.label}` : 'Value';
  if (column?.options?.length)
    return (
      <Form.Item name={name} noStyle rules={[{ required: true, message: 'Choose a value' }]}>
        <Select aria-label={label} showSearch={{ optionFilterProp: 'label' }} options={column.options.map((o) => ({ value: o, label: o }))} placeholder="Choose" style={{ width: '100%' }} />
      </Form.Item>
    );
  if (column?.kind === 'date')
    return (
      <Form.Item name={name} noStyle rules={[{ required: true, message: 'Choose the day' }]} {...asDay('YYYY-MM-DD')}>
        <DatePicker aria-label={label} style={{ width: '100%' }} />
      </Form.Item>
    );
  if (column?.kind === 'month')
    return (
      <Form.Item name={name} noStyle rules={[{ required: true, message: 'Choose the month' }]} {...asDay('YYYY-MM')}>
        <DatePicker picker="month" format={MONTH_PICKER_FORMAT} aria-label={label} style={{ width: '100%' }} />
      </Form.Item>
    );
  const numeric = column && ['money', 'qty', 'pct', 'days', 'count'].includes(column.kind);
  return (
    <Form.Item name={name} noStyle rules={[{ required: true, whitespace: true, message: 'Enter a value' }, ...(numeric ? [{ pattern: /^-?\d+(\.\d+)?$/, message: 'Enter a number, like 50000' }] : [])]}>
      <Input aria-label={label} inputMode={numeric ? 'decimal' : undefined} placeholder={numeric ? 'e.g. 50000' : undefined} />
    </Form.Item>
  );
}

/**
 * New report or Edit (ARCHITECTURE "Reports you build"): what the report is over, its columns in order, the conditions,
 * one grouping, the totals and the sort, offered only from the reader's catalogue of the source. The API checks the
 * definition again against the same catalogue, so nothing here is trusted.
 */
export function ReportForm({ open, report, onClose }: { open: boolean; report?: SavedReportDto | null; onClose: () => void }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const router = useRouter();
  const { data: sources } = useReportSources(open);
  const save = useSaveReport();
  // A new report opens on its own page once the form has closed.
  const justSaved = useRef<string | null>(null);
  const close = () => {
    const id = justSaved.current;
    justSaved.current = null;
    onClose();
    if (id) afterFormLeaves(() => router.push(`/my-reports/${id}`));
  };
  const sourceKey = Form.useWatch('source', form);
  const chosen = Form.useWatch('columns', form) as string[] | undefined;
  const filters = Form.useWatch('filters', form) as FilterLine[] | undefined;
  const source = sources?.find((s) => s.key === sourceKey);
  const byKey = useMemo(() => new Map((source?.columns ?? []).map((c) => [c.key, c])), [source]);
  const live = (source?.columns ?? []).filter((c) => !c.archived || (chosen ?? []).includes(c.key));
  const shown = (chosen ?? []).map((k) => byKey.get(k)).filter((c): c is ReportCatalogueColumnDto => !!c);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (report) {
      const d = report.definition;
      form.setFieldsValue({ name: report.name, shared: report.shared, source: d.source, columns: d.columns, groupBy: d.groupBy ?? undefined, totals: d.totals, sortColumn: d.sort?.column, sortDesc: d.sort?.desc ?? false, filters: d.filters });
    }
  }, [open, report, form]);

  // A new report starts on its source's usual columns, and on the first source the reader has.
  useEffect(() => {
    if (!open || report || !sources?.length) return;
    if (!form.getFieldValue('source')) form.setFieldsValue({ source: sources[0].key, ...startFrom(sources[0]) });
  }, [open, report, sources, form]);

  const onSource = (key: ReportSourceKey) => {
    const s = sources?.find((x) => x.key === key);
    if (s) form.setFieldsValue(startFrom(s));
  };
  // Totals and the sort only name columns the report shows.
  const onColumns = (cols: string[]) => {
    const totals = (form.getFieldValue('totals') as string[] | undefined) ?? [];
    form.setFieldValue('totals', totals.filter((k) => cols.includes(k)));
    const sort = form.getFieldValue('sortColumn') as string | undefined;
    if (sort && !cols.includes(sort)) form.setFieldValue('sortColumn', undefined);
  };

  const submit = async (v: FormValues) => {
    const definition: ReportDefinition = {
      source: v.source!,
      columns: v.columns,
      filters: (v.filters ?? []).filter((f) => f.column && f.op && f.value !== undefined && f.value !== '').map((f) => ({ column: f.column!, op: f.op!, value: String(f.value).trim() })),
      groupBy: v.groupBy ?? null,
      totals: v.totals ?? [],
      sort: v.sortColumn ? { column: v.sortColumn, desc: !!v.sortDesc } : null,
    };
    const saved = await save.mutateAsync({ id: report?.id, name: v.name.trim(), shared: !!v.shared, definition });
    message.success(report ? 'Report saved' : 'Report saved. It opens on the reporting month.');
    if (!report) justSaved.current = saved.id;
  };

  return (
    <FormShell open={open} onClose={close} form={form} layout="drawer" title={report ? `Edit ${report.name}` : 'New report'} okText="Save report" onSubmit={submit} projectDefault={false}>
      <Form form={form} name="report" layout="vertical" initialValues={{ columns: [], totals: [], filters: [], shared: false, sortDesc: false }}>
        <FormSection title="Report">
          <FormGrid cols={2}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Name the report' }, { max: MAX_REPORT_NAME, message: `Keep the name to ${MAX_REPORT_NAME} letters` }]}>
              <Input placeholder="e.g. Orders by vendor" maxLength={MAX_REPORT_NAME} />
            </Form.Item>
            <Form.Item name="source" label="Over" rules={[{ required: true, message: 'Choose what the report is over' }]} extra={report ? 'A saved report stays over what it was made for.' : undefined}>
              <Select disabled={!!report} options={(sources ?? []).map((s) => ({ value: s.key, label: s.label }))} onChange={onSource} placeholder="Choose" />
            </Form.Item>
          </FormGrid>
          <Form.Item name="shared" valuePropName="checked" style={{ marginBottom: 0 }} extra="Each person sees it with their own access: only their projects, and only the columns their role sees.">
            <Checkbox>Everyone in the company whose role opens it may open it</Checkbox>
          </Form.Item>
        </FormSection>
        <FormSection title="Columns">
          <Form.Item
            name="columns"
            label="Columns, in order"
            rules={[{ required: true, type: 'array', min: 1, message: 'Choose at least one column' }, { type: 'array', max: MAX_REPORT_COLUMNS, message: `Keep it to ${MAX_REPORT_COLUMNS} columns` }]}
            extra={source?.dated ? `The period on the report's page is over ${source.dated.label.toLowerCase()}.` : undefined}
          >
            <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} options={live.map((c) => ({ value: c.key, label: c.archived ? `${c.label} (archived)` : c.label }))} onChange={onColumns} placeholder="Choose the columns" />
          </Form.Item>
          <FormGrid cols={2}>
            <Form.Item name="groupBy" label="Group by" extra="One line per group, with its count and totals, above the rows.">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={live.filter((c) => c.group).map((c) => ({ value: c.key, label: c.label }))} placeholder="No grouping" />
            </Form.Item>
            <Form.Item name="totals" label="Totals">
              <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} options={shown.filter((c) => c.sum).map((c) => ({ value: c.key, label: c.label }))} placeholder={shown.some((c) => c.sum) ? 'Choose the columns to total' : 'No column shown adds up'} disabled={!shown.some((c) => c.sum)} />
            </Form.Item>
            <Form.Item name="sortColumn" label="Sort by">
              <Select allowClear showSearch={{ optionFilterProp: 'label' }} options={shown.map((c) => ({ value: c.key, label: c.label }))} placeholder="As the list sorts them" />
            </Form.Item>
            <Form.Item name="sortDesc" label="Order" valuePropName="checked">
              <Checkbox>Largest or latest first</Checkbox>
            </Form.Item>
          </FormGrid>
        </FormSection>
        <FormSection title="Conditions">
          <Typography.Paragraph type="secondary" style={{ marginTop: 0, fontSize: tk.type.caption.fontSize }}>
            Rows that meet every condition. Left empty, the report has every row you see.
          </Typography.Paragraph>
          <LineTable
            name="filters"
            label="Condition"
            addText="Add condition"
            newLine={() => ({})}
            footer={(fields) => (fields.length >= MAX_REPORT_FILTERS ? <Typography.Text type="secondary">Up to {MAX_REPORT_FILTERS} conditions.</Typography.Text> : null)}
            columns={[
              {
                key: 'column',
                title: 'Column',
                width: '36%',
                render: (f) => (
                  <Form.Item name={[f.name, 'column']} noStyle rules={[{ required: true, message: 'Choose the column' }]}>
                    <Select
                      aria-label="Column"
                      showSearch={{ optionFilterProp: 'label' }}
                      options={live.map((c) => ({ value: c.key, label: c.label }))}
                      placeholder="Choose"
                      style={{ width: '100%' }}
                      onChange={(k: string) => {
                        const c = byKey.get(k);
                        form.setFieldValue(['filters', f.name, 'op'], c ? filterOpsFor(c.kind)[0] : undefined);
                        form.setFieldValue(['filters', f.name, 'value'], undefined);
                      }}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'op',
                title: 'Condition',
                width: '24%',
                render: (f) => {
                  const c = byKey.get(filters?.[f.name]?.column ?? '');
                  return (
                    <Form.Item name={[f.name, 'op']} noStyle rules={[{ required: true, message: 'Choose the condition' }]}>
                      <Select aria-label="Condition" options={(c ? filterOpsFor(c.kind) : []).map((o) => ({ value: o, label: REPORT_FILTER_OP_LABELS[o] }))} placeholder="Choose" style={{ width: '100%' }} />
                    </Form.Item>
                  );
                },
              },
              {
                key: 'value',
                title: 'Value',
                render: (f) => <FilterValue column={byKey.get(filters?.[f.name]?.column ?? '')} name={[f.name, 'value']} />,
              },
            ]}
          />
        </FormSection>
      </Form>
    </FormShell>
  );
}
