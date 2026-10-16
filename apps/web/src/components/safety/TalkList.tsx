'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Popconfirm, Space, Table, Typography } from 'antd';
import type { TableProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ToolboxTalkDto } from '@erp/shared';
import { canEditSafetyRecord, canReportSafety } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToolboxTalks } from '@/lib/queries';
import { useListState } from '@/lib/listState';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { TalkFormModal } from './TalkFormModal';

const EXPORT: ExportColumn<ToolboxTalkDto>[] = [
  { header: 'No.', value: (r) => r.talkNo, width: 15 },
  { header: 'Project', value: (r) => r.projectName, width: 30 },
  { header: 'Date', value: (r) => r.date, width: 12 },
  { header: 'Topic', value: (r) => r.topic, width: 40 },
  { header: 'Given by', value: (r) => r.conductedBy, width: 24 },
  { header: 'Contractor', value: (r) => r.contractor ?? '', width: 24 },
  { header: 'Attended', value: (r) => r.attendeeCount, width: 10 },
  { header: 'Minutes', value: (r) => r.durationMinutes ?? '', width: 9 },
  { header: 'Names', value: (r) => r.attendees ?? '', width: 40 },
  { header: 'Points covered', value: (r) => r.notes ?? '', width: 40 },
  { header: 'Recorded by', value: (r) => r.recordedByName, width: 20 },
];

/** Toolbox talks held at site. */
export function TalkList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const list = useListState<'date'>({ sortBy: 'date', sortOrder: 'desc' });
  const [projectFilter, setProjectFilter] = useProjectScope();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ToolboxTalkDto | null>(null);
  const projectId = fixedProject ?? projectFilter;
  const { sortBy: _sortBy, ...paging } = list.params;
  const filters = { ...paging, projectId };
  const { data, isLoading, isFetching, error, refetch } = useToolboxTalks(filters);
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/safety/talks/${id}`)).data,
    onSuccess: () => {
      message.success('Toolbox talk deleted');
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: TableProps<ToolboxTalkDto>['columns'] = [
    { title: 'No.', dataIndex: 'talkNo', width: 135, className: 'mono' },
    { title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
    ...(fixedProject ? [] : [{ title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: ToolboxTalkDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> }]),
    {
      title: 'Topic',
      dataIndex: 'topic',
      render: (v, r) => (
        <div>
          {v}
          <div className="text-muted" style={{ fontSize: 12 }}>
            {[`by ${r.conductedBy}`, r.contractor, r.durationMinutes ? `${r.durationMinutes} min` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { title: 'Attended', dataIndex: 'attendeeCount', width: 90, align: 'right' },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, r) =>
        user && canEditSafetyRecord(user, r.recordedById) ? (
          <Space>
            <Button size="small" onClick={() => setEditing(r)}>
              Edit
            </Button>
            <Popconfirm title="Delete this toolbox talk?" onConfirm={() => remove.mutate(r.id)}>
              <Button size="small" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar
        projectId={projectFilter}
        onProject={(v) => {
          setProjectFilter(v);
          list.resetPage();
        }}
        hideProject={!!fixedProject}
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search topic, given by"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<ToolboxTalkDto>('/safety/talks', filters);
                downloadXlsx(exportFileName('toolbox-talks'), 'talks', EXPORT, rows);
                return rows.length;
              }}
            />
            {user && canReportSafety(user.roleKey) ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                Record talk
              </Button>
            ) : null}
          </>
        }
      />
      <Table<ToolboxTalkDto>
        rowKey="id"
        className="talk-list"
        size="middle"
        loading={isLoading || isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        {...list.tableProps<ToolboxTalkDto>(data?.total)}
        expandable={{
          rowExpandable: (r) => !!(r.attendees || r.notes || r.attachments.length),
          expandedRowRender: (r) => (
            <div style={{ display: 'grid', gap: 8 }}>
              {r.notes ? <Typography.Text>{r.notes}</Typography.Text> : null}
              {r.attendees ? <Typography.Text type="secondary">Attended: {r.attendees}</Typography.Text> : null}
              {r.attachments.length ? <AttachmentGallery attachments={r.attachments} /> : null}
            </div>
          ),
        }}
        scroll={{ x: fixedProject ? 800 : 1000 }}
        locale={{ emptyText: 'No toolbox talks recorded' }}
      />
      <TalkFormModal
        open={formOpen || !!editing}
        talk={editing}
        projectId={fixedProject}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
