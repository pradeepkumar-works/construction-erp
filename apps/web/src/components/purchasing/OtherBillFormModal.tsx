'use client';

import React, { useEffect, useMemo } from 'react';
import { Alert, Checkbox, Form, Input, Select, Table, Typography } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttachmentDto, ExpenseCategory, VendorBillDto, VendorBillKind } from '@erp/shared';
import { EQUIPMENT_RATE_UNIT_LABELS, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, GST_RATES, HIRE_FUEL_BY_LABELS, VENDOR_BILL_KIND_LABELS } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useBillableJobs, useEquipment, useHirePreview, useProjects, useVendorBill } from '@/lib/queries';
import { VendorSelect } from '@/components/common/SearchSelect';
import { formatDate, formatINR, formatQty, toNumber } from '@/lib/format';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { UnitInput } from '@/components/common/UnitInput';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { MoneyInput, QuantityInput } from '@/components/form/inputs';
import { themeFontSize } from '@/lib/theme';
import { recordPage } from '@/components/approvals/queue';

export type OtherBillKind = Exclude<VendorBillKind, 'PO'>;

interface LineValue {
  description?: string;
  unit?: string;
  quantity?: number | null;
  rate?: number | null;
  gstRate?: number;
}

interface FormValues {
  projectId: string;
  vendorId?: string;
  equipmentId?: string;
  hireMonth?: dayjs.Dayjs;
  hireQuantity?: number | null;
  hireRate?: number | null;
  hireGstRate?: number;
  fuelRate?: number | null;
  jobIds?: string[];
  expenseCategory?: ExpenseCategory;
  invoiceNo: string;
  invoiceDate: dayjs.Dayjs;
  freight?: number | null;
  remarks?: string;
  lines: LineValue[];
  docs?: AttachmentDto[];
}

/** Lines typed on a hire bill start here; 0 and 1 are the hire and minimum-hours lines the logs give. */
const HIRE_EXTRA_FROM = 10;
const lineAmount = (l: LineValue | undefined) => Math.round(toNumber(l?.quantity) * toNumber(l?.rate) * 100) / 100;
const lineGst = (l: LineValue | undefined) => Math.round(lineAmount(l) * toNumber(l?.gstRate)) / 100;
const RATE_WORD = { HOUR: 'hour', DAY: 'day', MONTH: 'month' } as const;

const TITLES: Record<OtherBillKind, string> = { HIRE: 'Record hire bill', SERVICE: 'Record workshop bill', OTHER: 'Record service bill' };

/**
 * A vendor bill without a purchase order: a hired machine's month from its approved logs, a workshop's
 * bill for closed job cards, or another service (transport, testing, consultancy) booked to an expense head. The API
 * works the hire lines out from the logs; what does not match them is recorded as an exception for the approver.
 */
export function OtherBillFormModal({
  open,
  kind: startKind,
  bill: given,
  start,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: OtherBillKind;
  bill?: VendorBillDto | null;
  start?: { projectId?: string; equipmentId?: string };
  onClose: () => void;
  onSaved?: (b: VendorBillDto) => void;
}) {
  // A row from the list has no sources (the bill's logs or job cards): editing reads the whole bill first.
  const fetched = useVendorBill(open && given && !given.sources ? given.id : undefined);
  const bill = given && !given.sources ? (fetched.data ?? null) : (given ?? null);
  const kind = (given?.kind as OtherBillKind | undefined) ?? startKind;
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const notify = useNotify();
  const { data: projects } = useProjects();
  const projectId = Form.useWatch('projectId', form) as string | undefined;
  const equipmentId = Form.useWatch('equipmentId', form) as string | undefined;
  const hireMonth = Form.useWatch('hireMonth', form) as dayjs.Dayjs | undefined;
  const hireQuantity = Form.useWatch('hireQuantity', form) as number | null | undefined;
  const hireRate = Form.useWatch('hireRate', form) as number | null | undefined;
  const hireGstRate = Form.useWatch('hireGstRate', form) as number | undefined;
  const fuelRate = Form.useWatch('fuelRate', form) as number | null | undefined;
  const jobIds = Form.useWatch('jobIds', form) as string[] | undefined;
  const freight = Form.useWatch('freight', form);
  const lines = Form.useWatch('lines', { form, preserve: true }) as LineValue[] | undefined;

  const machines = useEquipment({ ownership: 'HIRED', pageSize: 200 }, open && kind === 'HIRE');
  const preview = useHirePreview(open && kind === 'HIRE' ? { equipmentId, projectId, month: hireMonth?.format('YYYY-MM'), billId: bill?.id } : {});
  const jobs = useBillableJobs(open && kind === 'SERVICE' ? { projectId, billId: bill?.id } : {});
  const p = preview.data;

  const startProject = start?.projectId;
  const startEquipment = start?.equipmentId;
  useEffect(() => {
    if (!open || (given && !bill)) return;
    form.resetFields();
    if (bill) {
      const hire = bill.lines.find((l) => l.sortOrder === 0);
      const typed = kind === 'HIRE' ? bill.lines.filter((l) => l.sortOrder >= HIRE_EXTRA_FROM) : bill.lines;
      form.setFieldsValue({
        projectId: bill.projectId,
        vendorId: bill.vendorId,
        equipmentId: bill.equipmentId ?? undefined,
        hireMonth: bill.hireMonth ? dayjs(bill.hireMonth) : undefined,
        hireQuantity: hire ? toNumber(hire.quantity) : undefined,
        hireRate: hire ? toNumber(hire.rate) : undefined,
        hireGstRate: hire ? toNumber(hire.gstRate) : 18,
        fuelRate: toNumber(bill.fuelRate) || null,
        jobIds: (bill.sources ?? []).map((s) => s.id),
        expenseCategory: bill.expenseCategory ?? undefined,
        invoiceNo: bill.invoiceNo,
        invoiceDate: dayjs(bill.invoiceDate),
        freight: toNumber(bill.freight),
        remarks: bill.remarks ?? undefined,
        docs: bill.attachments,
        lines: typed.map((l) => ({ description: l.itemName, unit: l.unit, quantity: toNumber(l.quantity), rate: toNumber(l.rate), gstRate: toNumber(l.gstRate) })),
      });
    } else
      form.setFieldsValue({
        projectId: startProject,
        equipmentId: startEquipment,
        // A hire bill usually comes in the month after the work.
        hireMonth: dayjs().subtract(dayjs().date() <= 10 ? 1 : 0, 'month').startOf('month'),
        hireGstRate: 18,
        invoiceDate: dayjs(),
        freight: 0,
        lines: kind === 'HIRE' ? [] : [{ gstRate: 18 }],
      });
  }, [open, given, bill, kind, startProject, startEquipment, form]);

  // A new hire bill takes the logs' quantity and the machine's rate until either is typed over.
  useEffect(() => {
    if (!p || bill) return;
    if (!form.isFieldTouched('hireQuantity')) form.setFieldValue('hireQuantity', toNumber(p.hireQuantity) || null);
    if (!form.isFieldTouched('hireRate')) form.setFieldValue('hireRate', p.rate ? toNumber(p.rate) : null);
  }, [p, bill, form]);

  const billable = useMemo(() => jobs.data ?? [], [jobs.data]);
  // Picking job cards on a new bill fills a line for each, at its recorded labour and parts, when no line is typed yet.
  const pickJobs = (ids: string[]) => {
    const current = (form.getFieldValue('lines') as LineValue[] | undefined) ?? [];
    if (bill || current.some((l) => l.description?.trim() || toNumber(l.rate))) return;
    const picked = billable.filter((j) => ids.includes(j.id));
    form.setFieldValue(
      'lines',
      picked.length
        ? picked.map((j) => ({ description: `${j.jobNo} ${j.equipmentCode}: ${j.description}`.slice(0, 200), unit: 'job', quantity: 1, rate: toNumber(j.labourCost) + toNumber(j.partsCost), gstRate: 18 }))
        : [{ gstRate: 18 }],
    );
  };

  const hireLines = useMemo(() => {
    if (kind !== 'HIRE' || !p) return [];
    const rate = toNumber(hireRate);
    const out = [{ key: 'hire', label: `${p.equipmentCode} ${p.equipmentName}, hire for ${dayjs(p.month).format('MMMM YYYY')}`, unit: RATE_WORD[p.rateUnit], quantity: toNumber(hireQuantity) }];
    if (toNumber(p.minTopUpHours) > 0 && p.rateUnit === 'HOUR') out.push({ key: 'min', label: `Minimum ${formatQty(p.hireMinHours)} hours a month: hours not worked`, unit: 'hour', quantity: toNumber(p.minTopUpHours) });
    return out.map((l) => ({ ...l, rate, amount: Math.round(l.quantity * rate * 100) / 100 }));
  }, [kind, p, hireQuantity, hireRate]);

  const fuelLitres = toNumber(p?.fuelLitres);
  const fuelRecovery = Math.round(fuelLitres * toNumber(fuelRate) * 100) / 100;
  const totals = useMemo(() => {
    const hireSub = hireLines.reduce((s, l) => s + l.amount, 0);
    const subtotal = hireSub + (lines ?? []).reduce((s, l) => s + lineAmount(l), 0);
    const gst = Math.round(hireSub * toNumber(hireGstRate)) / 100 + (lines ?? []).reduce((s, l) => s + lineGst(l), 0);
    const total = subtotal + gst + toNumber(freight);
    return { subtotal, gst, total, payable: total - fuelRecovery };
  }, [hireLines, hireGstRate, lines, freight, fuelRecovery]);

  /** What the approver will see flagged, worked out as the API does. */
  const issues = useMemo(() => {
    const out: string[] = [];
    if (kind === 'HIRE' && p) {
      const unit = RATE_WORD[p.rateUnit];
      if (toNumber(hireQuantity) > toNumber(p.hireQuantity)) out.push(`${formatQty(hireQuantity)} ${unit}s billed, ${formatQty(p.hireQuantity)} in the approved logs`);
      if (p.rate && toNumber(hireRate) > toNumber(p.rate)) out.push(`Hire rate above the agreed ${formatINR(p.rate, true)} ${EQUIPMENT_RATE_UNIT_LABELS[p.rateUnit]}`);
      if (p.pendingLogs) out.push(`${p.pendingLogs} log${p.pendingLogs === 1 ? ' of the month is' : 's of the month are'} not approved yet and not billed`);
      if (fuelLitres > 0 && !toNumber(fuelRate)) out.push(`${formatQty(fuelLitres)} litres of diesel we issued are not recovered: enter the diesel rate`);
    }
    if (kind === 'SERVICE') {
      const recorded = billable.filter((j) => jobIds?.includes(j.id)).reduce((s, j) => s + toNumber(j.labourCost) + toNumber(j.partsCost), 0);
      const billed = (lines ?? []).reduce((s, l) => s + lineAmount(l), 0);
      if (jobIds?.length && billed > recorded + 1) out.push(`${formatINR(billed, true)} billed before GST; the job cards record ${formatINR(recorded, true)} of labour and parts`);
    }
    return out;
  }, [kind, p, hireQuantity, hireRate, fuelLitres, fuelRate, billable, jobIds, lines]);

  const save = useMutation({
    mutationFn: async ({ v, submit }: { v: FormValues; submit: boolean }) => {
      const typed = (v.lines ?? [])
        .filter((l) => l.description?.trim() && toNumber(l.quantity) > 0)
        .map((l) => ({ description: l.description!.trim(), unit: l.unit?.trim() || undefined, quantity: String(l.quantity), rate: String(l.rate ?? 0), gstRate: String(l.gstRate ?? 0) }));
      const body = {
        invoiceNo: v.invoiceNo.trim(),
        invoiceDate: v.invoiceDate.format('YYYY-MM-DD'),
        freight: String(v.freight ?? 0),
        remarks: v.remarks?.trim() || null,
        attachmentIds: (v.docs ?? []).map((d) => d.id),
        lines: typed,
        submit,
        ...(kind === 'HIRE'
          ? { hireQuantity: v.hireQuantity != null ? String(v.hireQuantity) : undefined, hireRate: v.hireRate != null ? String(v.hireRate) : undefined, hireGstRate: String(v.hireGstRate ?? 18), fuelRate: String(v.fuelRate ?? 0) }
          : {}),
        ...(kind === 'SERVICE' ? { jobIds: v.jobIds ?? [] } : {}),
        ...(kind === 'OTHER' ? { expenseCategory: v.expenseCategory } : {}),
      };
      if (bill) return (await api.patch<VendorBillDto>(`/vendor-bills/${bill.id}`, body)).data;
      return (
        await api.post<VendorBillDto>('/vendor-bills', {
          ...body,
          id: crypto.randomUUID(),
          kind,
          projectId: v.projectId,
          ...(kind === 'HIRE' ? { equipmentId: v.equipmentId, hireMonth: v.hireMonth?.format('YYYY-MM') } : { vendorId: v.vendorId }),
        })
      ).data;
    },
    onSuccess: (b, { submit }) => {
      notify.saved(`${b.billNo} ${submit ? 'submitted for approval' : 'saved as a draft'}${b.matched ? '' : ', with exceptions for the approver'}`, recordPage('VENDOR_BILL', b.id));
      for (const k of ['vendor-bills', 'machinery', 'maintenance', 'payables']) qc.invalidateQueries({ queryKey: [k] });
      onSaved?.(b);
    },
    meta: FAIL_NOTICE,
  });

  const hireBlocked = (!!given && !bill) || (kind === 'HIRE' && (!p || !!p.existingBill || !p.vendorId));
  const money = (v: number | string) => (
    <span className="mono" translate="no">
      {formatINR(v, true)}
    </span>
  );

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1040}
      allValues
      title={given ? `Edit ${given.billNo}` : TITLES[kind]}
      okText="Save and submit"
      secondaryText="Save draft"
      okDisabled={hireBlocked}
      draftKey={given || kind === 'HIRE' ? undefined : `vendor-bill-${kind.toLowerCase()}:${start?.projectId ?? 'any'}`}
      onSubmit={(v, secondary) => save.mutateAsync({ v, submit: !secondary })}
      footerExtra={
        <Typography.Text strong className="mono" style={{ marginInlineEnd: 8 }}>
          {formatINR(totals.total, true)}
        </Typography.Text>
      }
    >
      <Form form={form} layout="vertical">
        <FormSection title={VENDOR_BILL_KIND_LABELS[kind]}>
          <FormGrid cols={kind === 'OTHER' ? 3 : 2}>
            <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
              <Select showSearch={{ optionFilterProp: 'label' }} disabled={!!bill} options={(projects ?? []).map((pr) => ({ value: pr.id, label: `${pr.code} - ${pr.name}` }))} />
            </Form.Item>
            {kind === 'HIRE' ? (
              <FormGrid cols={2}>
                <Form.Item name="equipmentId" label="Hired machine" rules={[{ required: true, message: 'Choose the hired machine' }]}>
                  <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    disabled={!!bill}
                    loading={machines.isLoading}
                    options={(machines.data?.items ?? []).map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }))}
                  />
                </Form.Item>
                <Form.Item name="hireMonth" label="Month billed" rules={[{ required: true, message: 'Choose the month billed' }]}>
                  <DatePicker picker="month" format="MMM YYYY" allowClear={false} disabled={!!bill} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'month')} />
                </Form.Item>
              </FormGrid>
            ) : (
              <Form.Item name="vendorId" label={kind === 'SERVICE' ? 'Workshop' : 'Vendor'} rules={[{ required: true, message: 'Pick the vendor from the master' }]}>
                <VendorSelect prefer={['SERVICE']} disabled={!!bill} />
              </Form.Item>
            )}
            {kind === 'OTHER' ? (
              <Form.Item name="expenseCategory" label="Cost head" rules={[{ required: true, message: 'Choose the cost head the bill is booked to' }]}>
                <Select options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
              </Form.Item>
            ) : null}
          </FormGrid>
          <FormGrid cols={3}>
            <Form.Item name="invoiceNo" label="Vendor's invoice no." rules={[{ required: true, whitespace: true, message: 'Enter the invoice number' }]}>
              <Input maxLength={60} />
            </Form.Item>
            <Form.Item name="invoiceDate" label="Invoice date" rules={[{ required: true, message: 'Pick the invoice date' }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="freight" label="Freight">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
        </FormSection>

        {kind === 'HIRE' ? (
          <FormSection title="Hire from the logs">
            {preview.error ? (
              <Alert type="error" showIcon style={{ marginBottom: 12 }} title={errorMessage(preview.error)} />
            ) : !p ? (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} title={preview.isFetching ? 'Reading the approved logs…' : 'Choose the project, the hired machine and the month; the bill fills in from its approved logs.'} />
            ) : (
              <>
                {p.existingBill ? <Alert type="error" showIcon style={{ marginBottom: 12 }} title={`${p.equipmentCode} for ${dayjs(p.month).format('MMMM YYYY')} is already billed on ${p.existingBill.billNo}`} /> : null}
                {!p.vendorId ? <Alert type="error" showIcon style={{ marginBottom: 12 }} title={`Link ${p.equipmentCode} to its hire agency in the vendor master first (Machinery, ${p.equipmentCode}, Edit)`} /> : null}
                <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                  {[
                    p.vendorName,
                    `${p.logs.length} approved log${p.logs.length === 1 ? '' : 's'}: ${p.workedDays} days, ${formatQty(p.workedHours)} hours worked`,
                    p.rate ? `${formatINR(p.rate, true)} ${EQUIPMENT_RATE_UNIT_LABELS[p.rateUnit]}` : 'no rate in the machine master',
                    p.hireMinHours ? `at least ${formatQty(p.hireMinHours)} hours a month` : null,
                    p.hireFuelBy ? HIRE_FUEL_BY_LABELS[p.hireFuelBy] : null,
                    p.hireOperator === true ? 'operator included' : p.hireOperator === false ? 'operator ours' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography.Paragraph>
                <FormGrid cols={4}>
                  <Form.Item name="hireQuantity" label={`${RATE_WORD[p.rateUnit][0].toUpperCase()}${RATE_WORD[p.rateUnit].slice(1)}s billed`} extra={`${formatQty(p.hireQuantity)} in the logs`} rules={[{ required: true, message: 'Enter what the vendor bills' }]}>
                    <QuantityInput unit={RATE_WORD[p.rateUnit]} min={0.001} status={toNumber(hireQuantity) > toNumber(p.hireQuantity) ? 'warning' : undefined} />
                  </Form.Item>
                  <Form.Item name="hireRate" label="Hire rate" extra={p.rate ? `Agreed ${formatINR(p.rate, true)}` : undefined} rules={[{ required: true, message: 'Enter the hire rate' }]}>
                    <MoneyInput status={p.rate && toNumber(hireRate) > toNumber(p.rate) ? 'warning' : undefined} />
                  </Form.Item>
                  <Form.Item name="hireGstRate" label="GST on hire">
                    <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
                  </Form.Item>
                  {fuelLitres > 0 ? (
                    <Form.Item name="fuelRate" label="Diesel rate to recover" extra={`${formatQty(fuelLitres)} L we issued: ${formatINR(fuelRecovery, true)}`}>
                      <MoneyInput />
                    </Form.Item>
                  ) : null}
                </FormGrid>
                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  dataSource={hireLines}
                  style={{ marginBottom: 12 }}
                  columns={[
                    { title: 'Line', dataIndex: 'label' },
                    { title: 'Quantity', key: 'qty', width: 140, align: 'right', render: (_, l) => `${formatQty(l.quantity)} ${l.unit}` },
                    { title: 'Rate', dataIndex: 'rate', width: 130, align: 'right', render: (v: number) => money(v) },
                    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', render: (v: number) => <strong>{money(v)}</strong> },
                  ]}
                />
                {p.logs.length ? (
                  <Typography.Paragraph type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                    Logs: {p.logs.map((l) => `${formatDate(l.date)} ${formatQty(l.hoursWorked)} h`).join(', ')}. They lock once the bill is saved.
                  </Typography.Paragraph>
                ) : null}
              </>
            )}
          </FormSection>
        ) : null}

        {kind === 'SERVICE' ? (
          <FormSection title="Job cards">
            {!projectId ? (
              <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Choose the project; its closed job cards not yet billed show here." />
            ) : billable.length === 0 && !jobs.isLoading ? (
              <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="No closed job card on this project waits for a bill. Close the job with its cost first (Machinery, Maintenance)." />
            ) : (
              <Form.Item name="jobIds" rules={[{ required: true, type: 'array', min: 1, message: 'Choose the closed job cards the workshop bills' }]}>
                <Checkbox.Group style={{ display: 'grid', gap: 8 }} onChange={(ids) => pickJobs(ids as string[])}>
                  {billable.map((j) => (
                    <Checkbox key={j.id} value={j.id}>
                      <span className="mono" translate="no">
                        {j.jobNo}
                      </span>{' '}
                      {j.equipmentCode} · {j.description}
                      <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                        {' '}
                        · closed {j.closedDate ? formatDate(j.closedDate) : '-'} · labour {formatINR(j.labourCost, true)}, parts {formatINR(j.partsCost, true)}
                      </Typography.Text>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </Form.Item>
            )}
          </FormSection>
        ) : null}

        <FormSection title={kind === 'HIRE' ? 'Other charges (mobilisation, transport, operator)' : 'Lines'}>
          <LineTable
            name="lines"
            label={kind === 'HIRE' ? 'Charge' : 'Bill'}
            addText={kind === 'HIRE' ? 'Add a charge' : 'Add line'}
            min={kind === 'HIRE' ? 0 : 1}
            newLine={() => ({ gstRate: 18 })}
            columns={[
              {
                title: 'Description',
                key: 'description',
                render: (f) => (
                  <Form.Item name={[f.name, 'description']} noStyle rules={[{ required: true, whitespace: true, message: 'Say what the line is for' }]}>
                    <Input aria-label={`Description of line ${f.name + 1}`} maxLength={200} style={{ minWidth: 220 }} />
                  </Form.Item>
                ),
              },
              {
                title: 'Unit',
                key: 'unit',
                width: 90,
                render: (f) => (
                  <Form.Item name={[f.name, 'unit']} noStyle>
                    <UnitInput aria-label={`Unit of line ${f.name + 1}`} maxLength={20} />
                  </Form.Item>
                ),
              },
              {
                title: 'Quantity',
                key: 'qty',
                width: 120,
                render: (f) => (
                  <Form.Item name={[f.name, 'quantity']} noStyle rules={[{ required: true, message: 'Enter the quantity' }]}>
                    <QuantityInput min={0.001} aria-label={`Quantity of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                title: 'Rate',
                key: 'rate',
                width: 130,
                render: (f) => (
                  <Form.Item name={[f.name, 'rate']} noStyle rules={[{ required: true, message: 'Enter the rate' }]}>
                    <MoneyInput aria-label={`Rate of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              {
                title: 'GST',
                key: 'gst',
                width: 90,
                render: (f) => (
                  <Form.Item name={[f.name, 'gstRate']} noStyle initialValue={18}>
                    <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} aria-label={`GST of line ${f.name + 1}`} />
                  </Form.Item>
                ),
              },
              { title: 'Amount', key: 'amount', width: 130, align: 'right', render: (f) => money(lineAmount(lines?.[f.name])) },
            ]}
          />
        </FormSection>

        <FormGrid cols={2}>
          <div>
            {issues.length > 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title="The approver will see these exceptions"
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                }
              />
            )}
            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={2} maxLength={1000} placeholder={issues.length ? 'Why the bill differs, for the approver' : undefined} />
            </Form.Item>
            <Form.Item name="docs" label="Invoice scan">
              <PhotoUpload max={4} />
            </Form.Item>
          </div>
          <Alert
            type="info"
            title={
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px' }}>
                <span>Before GST</span>
                {money(totals.subtotal)}
                <span>GST</span>
                {money(totals.gst)}
                <span>Freight</span>
                {money(toNumber(freight))}
                <strong>Invoice total</strong>
                <strong>{money(totals.total)}</strong>
                {fuelRecovery > 0 ? (
                  <>
                    <span>Less diesel recovered</span>
                    {money(-fuelRecovery)}
                    <strong>Payable</strong>
                    <strong>{money(totals.payable)}</strong>
                  </>
                ) : null}
              </div>
            }
            description={
              <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                Due 30 days from the invoice.
              </Typography.Text>
            }
          />
        </FormGrid>
      </Form>
    </FormShell>
  );
}
