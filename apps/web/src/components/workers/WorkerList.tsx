'use client';

import React, { useState } from 'react';
import { App, Button, Popconfirm, Segmented, Space, Tag, theme } from 'antd';
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
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
import { RecordLink } from '@/components/record/RecordLink';
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

const KEYS = ['left'] as const;

function Sub({ children, as = 'div' }: { children: React.ReactNode; as?: 'div' | 'span' }) {
  const { token } = theme.useToken();
  return React.createElement(as, { style: { fontSize: as === 'div' ? token.fontSizeSM : undefined, color: token.colorTextSecondary } }, children);
}

/** The named worker register: contractor labour by name with trade, skill, ID and wage. */
export function WorkerList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const editor = !!user && canManageWorkers(user.roleKey);
  const [form, setForm] = useState<{ worker: WorkerDto | null } | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/workers/${id}`),
    onSuccess: () => {
      message.success('Worker deleted');
      qc.invalidateQueries({ queryKey: ['workers'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const frame = useListFrame<'name', WorkerDto>({
    list: 'workers',
    url: false,
    keys: KEYS,
    sortBy: 'name',
    sortOrder: 'asc',
    sortFields: ['name'],
    fixedProject,
    chipLabels: { left: () => 'Left' },
    columns: (): ListColumn<WorkerDto>[] =>
  [
      { key: 'workerNo', title: 'No.', dataIndex: 'workerNo', width: 90, className: 'mono' },
      {
        key: 'name',
        title: 'Name',
        locked: true,
        render: (_, w) => (
          <div>
            {editor ? (
              <RecordLink onOpen={() => setForm({ worker: w })} strong>
                {w.name}
              </RecordLink>
            ) : (
              <b>{w.name}</b>
            )}
            {w.fatherName ? <Sub>s/o {w.fatherName}</Sub> : null}
          </div>
        ),
      },
      { key: 'contractor', title: 'Contractor', dataIndex: 'contractor', width: 200 },
      { key: 'trade', title: 'Trade', dataIndex: 'trade', width: 140, render: (v: string, w) => <span>{v} <Tag style={{ marginLeft: 4 }}>{WORKER_SKILL_LABELS[w.skill]}</Tag></span> },
      { key: 'dailyWage', title: 'Wage / day', dataIndex: 'dailyWage', width: 110, align: 'right', render: (v: string) => formatINR(v) },
      { key: 'effectiveOtRate', title: 'OT / hour', dataIndex: 'effectiveOtRate', width: 100, align: 'right', render: (v: string, w) => (w.otRate ? formatINR(v, true) : <Sub as="span">{formatINR(v, true)}</Sub>) },
      ...(!fixedProject ? [{ key: 'projectName', title: 'Project', dataIndex: 'projectName', width: 220, render: (v: string | null) => v ?? <Sub as="span">Not posted</Sub> } satisfies ListColumn<WorkerDto>] : []),
      { title: 'ID', key: 'id', width: 170, render: (_, w) => (w.idType ? `${WORKER_ID_TYPE_LABELS[w.idType]} ${w.idNumber ?? ''}` : <Sub as="span">-</Sub>) },
      { key: 'lastSeenOn', title: 'Last on site', dataIndex: 'lastSeenOn', width: 120, render: (v: string | null, w) => (w.leftOn ? <Sub as="span">Left {formatDate(w.leftOn)}</Sub> : v ? formatDate(v) : <Sub as="span">-</Sub>) },
      ...(editor
        ? [
            {
              title: '',
              key: 'a',
              label: 'Actions',
              locked: true,
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
            } satisfies ListColumn<WorkerDto>,
          ]
        : []),
    ],
  });
  const { page } = frame;
  const active = page.filters.left !== '1';
  const filters = { projectId: frame.projectId, q: page.params.q, active, page: page.params.page, pageSize: page.params.pageSize };
  const { data, isLoading, isFetching, error, refetch } = useWorkers(filters);
  const rows = data?.items ?? [];

  const newButton = editor ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ worker: null })}>
      New worker
    </Button>
  ) : null;

  return (
    <div className="worker-list">
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search name, number, contractor, trade"
        searchLabel="Search workers"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const all = await fetchAllPages<WorkerDto>('/workers', { projectId: frame.projectId, q: page.params.q, active });
                await downloadXlsx(exportFileName('workers'), 'Workers', EXPORT, all);
                return all.length;
              }}
            />
            {newButton}
          </>
        }
      >
        <Segmented
          value={active ? 'active' : 'left'}
          onChange={(v) => page.setFilter('left', v === 'left' ? '1' : undefined)}
          options={[
            { value: 'active', label: 'Working' },
            { value: 'left', label: 'Left' },
          ]}
        />
      </ListToolbar>
      <DataTable<WorkerDto>
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={rows}
        loading={isLoading || isFetching}
        table={page.tableProps<WorkerDto>(data?.total)}
        onOpen={editor ? (id) => { const w = rows.find((x) => x.id === id); if (w) setForm({ worker: w }); } : undefined}
        bulk={[exportSelected<WorkerDto>('workers', 'Workers', EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        scrollX={1100}
        emptyText={<EmptyArt art="entries" title={!active ? 'Nobody has left' : page.params.q ? 'No worker matches this search' : 'No workers yet. Add the labour contractors’ workers by name to mark a daily roll call.'} />}
        emptyAction={newButton}
      />
      <WorkerFormModal open={!!form} onClose={() => setForm(null)} worker={form?.worker} projectId={fixedProject} />
    </div>
  );
}
