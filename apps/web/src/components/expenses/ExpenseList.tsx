'use client';

import React, { useState } from 'react';
import { Button, Checkbox, Select, Space, Statistic, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ExpenseCategory, ExpenseDto, PaymentMode } from '@erp/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, LIST_SORT_FIELDS, PAYMENT_MODES, PAYMENT_MODE_LABELS, canSubmitExpense } from '@erp/shared';
import { useNewIntent } from '@/lib/new-intent';
import { useAuth } from '@/lib/auth';
import { useExpenses, useExpenseSummary } from '@/lib/queries';
import { formatINR } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages } from '@/lib/exportExcel';
import { EXPENSE_EXPORT } from '@/lib/exportColumns';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable } from '@/components/list/DataTable';
import { DateRangeFilter } from '@/components/list/DateRangeFilter';
import { exportSelected, useBulkApprove } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { expenseColumns } from './ExpenseTable';
import { ExpenseDrawer } from './ExpenseDrawer';
import { ExpenseFormModal } from './ExpenseFormModal';
import { BRAND } from '@/lib/brand';
import { CardToolbar } from '@/components/common/CardToolbar';
import { themeColor } from '@/lib/theme';

const KEYS = ['status', 'mine', 'from', 'to', 'category', 'paymentMode', 'noReceipt'] as const;

/** Site expenses with totals for the current filters, used on the Expenses page and as a project tab. */
export function ExpenseList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const frame = useListFrame({
    list: 'expenses',
    type: 'EXPENSE',
    keys: KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: LIST_SORT_FIELDS.expenses,
    fixedProject,
    columns: (sortOrderFor) => expenseColumns({ showProject: !fixedProject, onOpen: setOpenId, onEdit: setEditing, sortOrderFor }),
    moreViews: [{ key: 'no-receipt', label: 'Without bill photo', filters: { noReceipt: '1' } }],
    chipLabels: {
      category: (v) => `Category: ${EXPENSE_CATEGORY_LABELS[v as ExpenseCategory] ?? v}`,
      paymentMode: (v) => `Paid by: ${PAYMENT_MODE_LABELS[v as PaymentMode] ?? v}`,
      noReceipt: () => 'Without bill photo',
    },
  });
  const { page } = frame;
  const category = page.filters.category as ExpenseCategory | undefined;
  const filters = {
    ...page.params,
    projectId: frame.projectId,
    status: frame.status,
    category,
    paymentMode: page.filters.paymentMode as PaymentMode | undefined,
    noReceipt: page.filters.noReceipt === '1' || undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useExpenses(filters);
  const { data: summary } = useExpenseSummary(filters);
  const approve = useBulkApprove<ExpenseDto>('expense', (r) => r.totalAmount);
  const mayFile = !!user && canSubmitExpense(user.roleKey);

  const exportRows = async () => {
    const rows = await fetchAllPages<ExpenseDto>('/expenses', { ...filters });
    downloadXlsx(exportFileName('expenses'), 'expenses', EXPENSE_EXPORT, rows);
    return rows.length;
  };

  useNewIntent('expense', mayFile, () => setFormOpen(true));

  return (
    <>
      {frame.views}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        status={frame.status}
        onStatus={frame.setStatus}
        search={page.search}
        onSearch={page.setSearch}
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
        <Select allowClear placeholder="All categories" aria-label="Category" style={{ width: 200 }} value={category} onChange={(v) => page.setFilter('category', v)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))} />
        <Select allowClear placeholder="Any payment" aria-label="Paid by" style={{ width: 150 }} value={filters.paymentMode} onChange={(v) => page.setFilter('paymentMode', v)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
        <DateRangeFilter {...frame.dateRange} />
        <Checkbox checked={!!filters.noReceipt} onChange={(e) => page.setFilter('noReceipt', e.target.checked ? '1' : undefined)}>
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
                <Tag style={{ cursor: 'pointer' }} color={category === c.category ? 'blue' : undefined} onClick={() => page.setFilter('category', category === c.category ? undefined : c.category)}>
                  {EXPENSE_CATEGORY_LABELS[c.category]}: {formatINR(c.totalAmount)}
                </Tag>
              </Tooltip>
            ))}
          </Space>
        </CardToolbar>
      ) : null}
      <DataTable<ExpenseDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<ExpenseDto>(data?.total)}
        onOpen={setOpenId}
        bulk={[...(approve ? [approve] : []), exportSelected<ExpenseDto>('expenses', 'expenses', EXPENSE_EXPORT)]}
        chips={frame.chips}
        scrollX={fixedProject ? 1550 : 1750}
        emptyText={<EmptyArt art="entries" title="No site expenses here yet" />}
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
        defaultProjectId={frame.projectId}
      />
    </>
  );
}
