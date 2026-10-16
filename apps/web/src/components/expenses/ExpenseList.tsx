'use client';

import React, { useState } from 'react';
import { Button, Checkbox, DatePicker, Select, Space, Statistic, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import type { ExpenseCategory, ExpenseDto, ExpenseSortField, PaymentMode, SubmissionStatus } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, PAYMENT_MODES, PAYMENT_MODE_LABELS, canSubmitExpense } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useExpenses, useExpenseSummary } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatINR } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { EXPENSE_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { ExpenseTable } from './ExpenseTable';
import { ExpenseDrawer } from './ExpenseDrawer';
import { ExpenseFormModal } from './ExpenseFormModal';
import { BRAND } from '@/lib/brand';
import { rangePresets } from '@/lib/dates';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

/** Site expenses with totals for the current filters, used on the Expenses page and as a project tab. */
export function ExpenseList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const list = useListState<ExpenseSortField>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [status, setStatus] = useState<SubmissionStatus | undefined>();
  const [category, setCategory] = useState<ExpenseCategory | undefined>();
  const [paymentMode, setPaymentMode] = useState<PaymentMode | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [noReceipt, setNoReceipt] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = {
    ...list.params,
    projectId,
    status,
    category,
    paymentMode,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
    noReceipt: noReceipt || undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useExpenses(filters);
  const { data: summary } = useExpenseSummary(filters);
  const mayFile = !!user && canSubmitExpense(user.roleKey);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    list.resetPage();
  };

  const exportRows = async () => {
    const rows = await fetchAllPages<ExpenseDto>('/expenses', { ...filters });
    downloadXlsx(exportFileName('expenses'), 'expenses', EXPENSE_EXPORT, rows);
    return rows.length;
  };

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={reset(setProjectFilter)}
        hideProject={!!fixedProject}
        status={status}
        onStatus={reset(setStatus)}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search no., description, vendor, bill"
        extra={
          <>
            <ExportButton onExport={exportRows} />
            {mayFile ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                New expense
              </Button>
            ) : null}
          </>
        }
      >
        <Select allowClear placeholder="All categories" style={{ width: 200 }} value={category} onChange={reset(setCategory)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
        <Select allowClear placeholder="Any payment" style={{ width: 150 }} value={paymentMode} onChange={reset(setPaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
        <DatePicker.RangePicker presets={rangePresets()} value={range} onChange={(v) => reset(setRange)(v as [Dayjs | null, Dayjs | null] | null)} format="DD MMM YYYY" allowEmpty={[true, true]} />
        <Checkbox checked={noReceipt} onChange={(e) => reset(setNoReceipt)(e.target.checked)}>
          Without bill photo
        </Checkbox>
      </ListToolbar>
      {summary ? (
        <CardToolbar variant="summary" wrap gap={32} align="flex-start">
          <Statistic title={`Total (${summary.count})`} value={formatINR(summary.totalAmount, true)} styles={{ content: { fontSize: 18 } }} />
          <Statistic title="GST in it" value={formatINR(summary.gstAmount, true)} styles={{ content: { fontSize: 18 } }} />
          <Statistic title="Approved (project cost)" value={formatINR(summary.approvedTotal, true)} styles={{ content: { fontSize: 18, color: themeColor('colorSuccessText') } }} />
          <Statistic title="Waiting for approval" value={formatINR(summary.pendingTotal, true)} styles={{ content: { fontSize: 18, color: BRAND.colors.pending } }} />
          <Space size={[4, 4]} wrap style={{ flex: 1, minWidth: 240 }}>
            {summary.byCategory.slice(0, 6).map((c) => (
              <Tooltip key={c.category} title={`${c.count} expense(s)`}>
                <Tag style={{ cursor: 'pointer' }} color={category === c.category ? 'blue' : undefined} onClick={() => reset(setCategory)(category === c.category ? undefined : c.category)}>
                  {EXPENSE_CATEGORY_LABELS[c.category]}: {formatINR(c.totalAmount)}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        </CardToolbar>
      ) : null}
      <ExpenseTable
        data={data?.items ?? []}
        loading={isLoading || isFetching}
        showProject={!fixedProject}
        onOpen={setOpenId}
        onEdit={setEditing}
        table={list.tableProps<ExpenseDto>(data?.total)}
        sortOrderFor={list.sortOrderFor}
      />
      <ExpenseDrawer id={openId} open={!!openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <ExpenseFormModal
        open={formOpen || !!editing}
        expense={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        projectId={fixedProject}
      />
    </>
  );
}
