'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { App, Button, Flex, Popconfirm, Space, Typography, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ToolboxTalkDto } from '@erp/shared';
import { canEditSafetyRecord, canReportSafety } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToolboxTalks } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { downloadXlsx, exportFileName, fetchAllPages, type ExportColumn } from '@/lib/exportExcel';
import { QueryError } from '@/components/common/QueryState';
import { ListToolbar } from '@/components/common/ListToolbar';
import { ExportButton } from '@/components/common/ExportButton';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, type ListColumn } from '@/components/list/DataTable';
import { exportSelected } from '@/components/list/bulk';
import { useListFrame } from '@/components/list/useListFrame';
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

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

const NO_KEYS: string[] = [];

/** Toolbox talks held at site. */
export function TalkList({ projectId: fixedProject }: { projectId?: string }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ToolboxTalkDto | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/safety/talks/${id}`)).data,
    onSuccess: () => {
      message.success('Toolbox talk deleted');
      qc.invalidateQueries({ queryKey: ['safety'] });
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const frame = useListFrame<'date', ToolboxTalkDto>({
    list: 'toolbox-talks',
    url: false,
    keys: NO_KEYS,
    sortBy: 'date',
    sortOrder: 'desc',
    sortFields: ['date'],
    fixedProject,
    columns: (): ListColumn<ToolboxTalkDto>[] => [
      { key: 'talkNo', title: 'No.', dataIndex: 'talkNo', width: 135, className: 'mono' },
      { key: 'date', title: 'Date', dataIndex: 'date', width: 110, render: (v) => formatDate(v) },
      ...(fixedProject
        ? []
        : [{ key: 'projectName', title: 'Project', dataIndex: 'projectName', width: 200, ellipsis: true, render: (v: string, r: ToolboxTalkDto) => <Link href={`/projects/${r.projectId}?tab=safety`}>{v}</Link> } satisfies ListColumn<ToolboxTalkDto>]),
      {
        key: 'topic',
        title: 'Topic',
        dataIndex: 'topic',
        locked: true,
        render: (v, r) => (
          <div>
            {v}
            <Sub>{[`by ${r.conductedBy}`, r.contractor, r.durationMinutes ? `${r.durationMinutes} min` : null].filter(Boolean).join(' · ')}</Sub>
          </div>
        ),
      },
      { key: 'attendeeCount', title: 'Attended', dataIndex: 'attendeeCount', width: 90, align: 'right', total: (rows) => rows.reduce((n, r) => n + r.attendeeCount, 0) },
      { key: 'recordedByName', title: 'Recorded by', dataIndex: 'recordedByName', width: 150, defaultHidden: true },
      {
        title: '',
        key: 'actions',
        label: 'Actions',
        locked: true,
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
    ],
  });
  const { page } = frame;
  const filters = { page: page.params.page, pageSize: page.params.pageSize, q: page.params.q, sortOrder: page.params.sortOrder, projectId: frame.projectId };
  const { data, isLoading, isFetching, error, refetch } = useToolboxTalks(filters);

  const newButton = user && canReportSafety(user.roleKey) ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      Record talk
    </Button>
  ) : null;

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <ListToolbar filters={frame.filterState}
        projectId={frame.projectFilter}
        onProject={frame.setProjectFilter}
        hideProject={!!fixedProject}
        search={page.search}
        onSearch={page.setSearch}
        searchPlaceholder="Search topic, given by"
        searchLabel="Search toolbox talks"
        extra={
          <>
            <ExportButton
              onExport={async () => {
                const rows = await fetchAllPages<ToolboxTalkDto>('/safety/talks', filters);
                await downloadXlsx(exportFileName('toolbox-talks'), 'talks', EXPORT, rows);
                return rows.length;
              }}
            />
            {newButton}
          </>
        }
      />
      <DataTable<ToolboxTalkDto>
        className="talk-list"
        columns={frame.columns}
        visible={frame.choice.visible}
        onChooseColumns={frame.choice.setChosen}
        chosenIsDefault={frame.choice.isDefault}
        rows={data?.items ?? []}
        loading={isLoading || isFetching}
        table={page.tableProps<ToolboxTalkDto>(data?.total)}
        bulk={[exportSelected<ToolboxTalkDto>('toolbox-talks', 'talks', EXPORT)]}
        chips={frame.chips}
        empty={frame.empty}
        failed={!!error}
        expandable={{
          rowExpandable: (r) => !!(r.attendees || r.notes || r.attachments.length),
          expandedRowRender: (r) => (
            <Flex vertical gap={8}>
              {r.notes ? <Typography.Text>{r.notes}</Typography.Text> : null}
              {r.attendees ? <Typography.Text type="secondary">Attended: {r.attendees}</Typography.Text> : null}
              {r.attachments.length ? <AttachmentGallery attachments={r.attachments} /> : null}
            </Flex>
          ),
        }}
        scrollX={fixedProject ? 800 : 1000}
        emptyText={<EmptyArt art="entries" title={page.params.q ? 'No toolbox talk matches this search' : 'No toolbox talks recorded'} />}
        emptyAction={newButton}
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
