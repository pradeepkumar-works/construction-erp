'use client';

import React, { useState } from 'react';
import { App, Button, Popconfirm, Segmented, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkerDto } from '@erp/shared';
import { WORKER_ID_TYPE_LABELS, WORKER_SKILL_LABELS, canManageWorkers } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useWorkers } from '@/lib/queries';
import { formatDate, formatINR } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { WorkerFormModal } from './WorkerFormModal';

const EXPORT: ExportColumn<WorkerDto>[] = [
  { header: 'No.', value: (w) => w.workerNo },
  { header: 'Name', value: (w) => w.name, width: 24 },
  { header: "Father's name", value: (w) => w.fatherName, width: 24 },
  { header: 'Contractor', value: (w) => w.contractor, width: 28 },
  { header: 'Trade', value: (w) => w.trade, width: 14 },
  { header: 'Skill', value: (w) => WORKER_SKILL_LABELS[w.skill], width: 14 },
  { header: 'Daily wage', value: (w) => Number(w.dailyWage) },
  { header: 'OT per hour', value: (w) => Number(w.effectiveOtRate) },
  { header: 'ID', value: (w) => (w.idType ? `${WORKER_ID_TYPE_LABELS[w.idType]} ${w.idNumber ?? ''}`.trim() : null), width: 26 },
  { header: 'Phone', value: (w) => w.phone, width: 14 },
  { header: 'Project', value: (w) => w.projectName, width: 34 },
  { header: 'Joined on', value: (w) => w.joinedOn, width: 12 },
  { header: 'Left on', value: (w) => w.leftOn, width: 12 },
  { header: 'Last on site', value: (w) => w.lastSeenOn, width: 12 },
];

/** The named worker register: contractor labour by name with trade, skill, ID and wage. */
export function WorkerList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editor = !!user && canManageWorkers(user.roleKey);
  const [projectFilter, setProjectFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form, setForm] = useState<{ worker: WorkerDto | null } | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const filters = { projectId, q: search.trim() || undefined, active, page, pageSize };
  const { data, isLoading, isFetching, error, refetch } = useWorkers(filters);

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/workers/${id}`),
    onSuccess: () => {
      message.success('Worker deleted');
      qc.invalidateQueries({ queryKey: ['workers'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const columns: TableProps<WorkerDto>['columns'] = [
    { title: 'No.', dataIndex: 'workerNo', width: 90, className: 'mono' },
    {
      title: 'Name',
      dataIndex: 'name',
      render: (v, w) => (
        <div>
          <b>{v}</b>
          {w.fatherName ? <div className="text-muted" style={{ fontSize: 12 }}>s/o {w.fatherName}</div> : null}
        </div>
      ),
    },
    { title: 'Contractor', dataIndex: 'contractor', width: 200 },
    { title: 'Trade', dataIndex: 'trade', width: 140, render: (v, w) => <span>{v} <Tag style={{ marginLeft: 4 }}>{WORKER_SKILL_LABELS[w.skill]}</Tag></span> },
    { title: 'Wage / day', dataIndex: 'dailyWage', width: 110, align: 'right', render: (v) => formatINR(v) },
    { title: 'OT / hour', dataIndex: 'effectiveOtRate', width: 100, align: 'right', render: (v, w) => <span className={w.otRate ? undefined : 'text-muted'}>{formatINR(v, true)}</span> },
    ...(!fixedProject ? [{ title: 'Project', dataIndex: 'projectName', width: 220, render: (v: string | null) => v ?? <span className="text-muted">Not posted</span> }] : []),
    { title: 'ID', key: 'id', width: 170, render: (_, w) => (w.idType ? `${WORKER_ID_TYPE_LABELS[w.idType]} ${w.idNumber ?? ''}` : <span className="text-muted">-</span>) },
    { title: 'Last on site', dataIndex: 'lastSeenOn', width: 120, render: (v, w) => (w.leftOn ? <span className="text-muted">Left {formatDate(w.leftOn)}</span> : v ? formatDate(v) : <span className="text-muted">-</span>) },
    ...(editor
      ? [
          {
            title: '',
            key: 'a',
            width: 80,
            render: (_: unknown, w: WorkerDto) => (
              <Space size={4}>
                <Button size="small" type="text" aria-label="Edit" icon={<EditOutlined />} onClick={() => setForm({ worker: w })} />
                {!w.lastSeenOn ? (
                  <Popconfirm title="Delete this worker?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(w.id)}>
                    <Button size="small" type="text" danger aria-label="Delete" icon={<DeleteOutlined />} />
                  </Popconfirm>
                ) : null}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="worker-list">
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setProjectFilter(v);
          setPage(1);
        }}
        hideProject={!!fixedProject}
        search={search}
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="Search name, number, contractor, trade"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<WorkerDto>('/workers', { projectId, q: search.trim() || undefined, active });
                downloadXlsx(exportFileName('workers'), 'Workers', EXPORT, rows);
                return rows.length;
              }}
            />
            {editor ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ worker: null })}>
                Add worker
              </Button>
            ) : null}
          </>
        }
      >
        <Segmented
          value={active ? 'active' : 'left'}
          onChange={(v) => {
            setActive(v === 'active');
            setPage(1);
          }}
          options={[
            { value: 'active', label: 'Working' },
            { value: 'left', label: 'Left' },
          ]}
        />
      </ListToolbar>
      <Table<WorkerDto>
        rowKey="id"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 1100 }}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, showSizeChanger: true, hideOnSinglePage: true, showTotal: (t) => `${t} workers` }}
        onChange={(p) => {
          setPage(p.current ?? 1);
          setPageSize(p.pageSize ?? 50);
        }}
        onRow={(w) => (editor ? { onDoubleClick: () => setForm({ worker: w }) } : {})}
        locale={{ emptyText: active ? 'No workers yet. Add the labour contractors’ workers by name to mark a daily roll call.' : 'Nobody has left' }}
      />
      <WorkerFormModal open={!!form} onClose={() => setForm(null)} worker={form?.worker} projectId={fixedProject} />
    </div>
  );
}
