'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Input, Popconfirm, Progress, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, FileExcelOutlined, PlusOutlined } from '@ant-design/icons';
import type { BoqItemDto } from '@erp/shared';
import { canEditProjects } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useBoq } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { BoqFormModal } from './BoqFormModal';
import { BoqImportModal, downloadBoqTemplate } from './BoqImportModal';
import { BRAND } from '@/lib/brand';
import { themeColor } from '@/lib/theme';
import { loadXlsx } from '@/lib/exportExcel';

export function BoqTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useBoq(projectId);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BoqItemDto | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const editor = !!user && canEditProjects(user.roleKey);

  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${projectId}/boq/${id}`),
    onSuccess: () => {
      message.success('BOQ item deleted');
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((i) => !q || i.itemNo.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  }, [data, search]);

  const totals = useMemo(() => {
    const items = data ?? [];
    const amount = items.reduce((s, i) => s + toNumber(i.amount), 0);
    const executed = items.reduce((s, i) => s + toNumber(i.executedQty) * toNumber(i.rate), 0);
    const measured = items.reduce((s, i) => s + toNumber(i.measuredAmount), 0);
    return { amount, executed, measured, count: items.length };
  }, [data]);

  const exportExcel = async () => {
    const XLSX = await loadXlsx();
    const ws = XLSX.utils.json_to_sheet(
      (data ?? []).map((i) => ({
        'Item No': i.itemNo,
        Description: i.description,
        Unit: i.unit,
        Rate: toNumber(i.rate),
        'Original Qty': toNumber(i.originalQty),
        'Revised Qty': i.revisedQty !== null ? toNumber(i.revisedQty) : '',
        'Executed Qty': toNumber(i.executedQty),
        'Balance Qty': toNumber(i.balanceQty),
        'Measured Qty': toNumber(i.measuredQty),
        'Measured awaiting approval': toNumber(i.pendingMeasuredQty),
        'Measured Value': toNumber(i.measuredAmount),
        Amount: toNumber(i.amount),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ');
    XLSX.writeFile(wb, `BOQ-${projectId.slice(0, 8)}.xlsx`);
  };

  const columns: TableProps<BoqItemDto>['columns'] = [
    { title: 'Item', dataIndex: 'itemNo', width: 70, fixed: 'left', sorter: (a, b) => a.sortOrder - b.sortOrder || a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }) },
    { title: 'Description', dataIndex: 'description', ellipsis: { showTitle: false }, render: (v) => <Tooltip title={v}>{v}</Tooltip> },
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    { title: 'Rate (₹)', dataIndex: 'rate', width: 120, align: 'right', className: 'mono', render: (v) => formatINR(v, true).replace('₹ ', '') },
    { title: 'Original Qty', dataIndex: 'originalQty', width: 100, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    { title: 'Revised Qty', dataIndex: 'revisedQty', width: 95, align: 'right', className: 'mono', render: (v) => (v === null ? <span className="text-muted">-</span> : formatQty(v)) },
    {
      title: 'Executed',
      dataIndex: 'executedQty',
      width: 140,
      className: 'mono',
      render: (v, r) => {
        const base = toNumber(r.revisedQty ?? r.originalQty);
        const pct = base > 0 ? Math.min(100, Math.round((toNumber(v) / base) * 1000) / 10) : 0;
        return (
          <div>
            <div style={{ textAlign: 'right' }}>{formatQty(v)}</div>
            <Progress percent={pct} size="small" showInfo={false} strokeColor={pct >= 100 ? themeColor('colorSuccess') : BRAND.colors.primary} aria-label={`${pct}% executed`} />
          </div>
        );
      },
    },
    {
      title: <Tooltip title="Approved measurement book quantity; awaiting approval below it">Measured</Tooltip>,
      dataIndex: 'measuredQty',
      width: 110,
      align: 'right',
      className: 'mono',
      render: (v, r) => (
        <div>
          <div>{toNumber(v) ? formatQty(v) : <span className="text-muted">-</span>}</div>
          {toNumber(r.pendingMeasuredQty) ? (
            <div className="text-muted" style={{ fontSize: 11 }}>
              +{formatQty(r.pendingMeasuredQty)} pending
            </div>
          ) : null}
        </div>
      ),
    },
    { title: 'Balance', dataIndex: 'balanceQty', width: 90, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    { title: 'Amount', dataIndex: 'amount', width: 140, align: 'right', className: 'mono', render: (v) => formatINR(v), sorter: (a, b) => toNumber(a.amount) - toNumber(b.amount) },
    ...(editor
      ? [
          {
            title: '',
            key: 'actions',
            width: 76,
            fixed: 'right' as const,
            render: (_: unknown, r: BoqItemDto) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  aria-label={`Edit BOQ item ${r.itemNo}`}
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                />
                <Popconfirm title="Delete this BOQ item?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => del.mutate(r.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete BOQ item ${r.itemNo}`} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space size={24} wrap>
          <Statistic title="BOQ items" value={totals.count} styles={{ content: { fontSize: 20 } }} />
          <Statistic title="BOQ amount" value={formatINR(totals.amount)} styles={{ content: { fontSize: 20 } }} />
          <Statistic title="Executed value" value={formatINR(totals.executed)} styles={{ content: { fontSize: 20 } }} />
          <Statistic title="Measured value (approved MB)" value={formatINR(totals.measured)} styles={{ content: { fontSize: 20 } }} />
        </Space>
        <Space wrap>
          <Input.Search placeholder="Search item / description" aria-label="Search BOQ items" allowClear value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!data || data.length === 0}>
            Export
          </Button>
          {editor && (
            <>
              <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>
                Import from Excel
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                Add item
              </Button>
            </>
          )}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<BoqItemDto>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={filtered}
        size="small"
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: true }}
        scroll={{ x: 1210 }}
        locale={{
          emptyText: (
            <div style={{ padding: 24 }}>
              <Typography.Text type="secondary">No BOQ items yet.</Typography.Text>
              {editor && (
                <div style={{ marginTop: 8 }}>
                  <Button type="link" onClick={downloadBoqTemplate}>
                    Download the Excel template
                  </Button>
                  and import it, or add items manually.
                </div>
              )}
            </div>
          ),
        }}
        summary={() =>
          filtered.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8}>
                  <strong>Total ({filtered.length} items)</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <strong>{formatINR(filtered.reduce((s, i) => s + toNumber(i.amount), 0))}</strong>
                </Table.Summary.Cell>
                {editor && <Table.Summary.Cell index={9} />}
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
      <BoqFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} item={editing} />
      <BoqImportModal open={importOpen} onClose={() => setImportOpen(false)} projectId={projectId} />
    </div>
  );
}
