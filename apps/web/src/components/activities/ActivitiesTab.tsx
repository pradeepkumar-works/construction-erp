'use client';

import React, { useState } from 'react';
import { App, Button, Popconfirm, Progress, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import type { ActivityDto, ProjectDetail, ProjectMemberDto } from '@erp/shared';
import { canEditProjects } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useActivities } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate, formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { ACTIVITY_EXPORT } from '@/lib/exportColumns';
import { ActivityFormModal } from './ActivityFormModal';
import { ApplyTemplateModal } from '@/components/templates/ApplyTemplateModal';

export function ActivitiesTab({ projectId, members, project }: { projectId: string; members: ProjectMemberDto[]; project?: ProjectDetail }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useActivities(projectId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityDto | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const editor = !!user && canEditProjects(user.roleKey);

  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/projects/${projectId}/activities/${id}`),
    onSuccess: () => {
      message.success('Activity deleted');
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const columns: TableProps<ActivityDto>['columns'] = [
    {
      title: 'Activity',
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <strong>{v}</strong>{' '}
          {r.isDelayed && (
            <Tag color="red" icon={<WarningOutlined />} style={{ marginLeft: 4 }}>
              Delayed
            </Tag>
          )}
          {r.holdPoint && (
            <Tag color="orange" style={{ marginLeft: 4 }}>
              Hold point
            </Tag>
          )}
          {(r.boqItemNo || r.checklistName) && (
            <div className="text-muted" style={{ fontSize: 12 }}>
              {[r.boqItemNo && `BOQ ${r.boqItemNo}`, r.checklistName && `Checklist: ${r.checklistName}`].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    { title: 'Unit', dataIndex: 'unit', width: 70 },
    { title: 'Planned', dataIndex: 'plannedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    { title: 'Executed', dataIndex: 'executedQty', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
    {
      title: 'Progress',
      dataIndex: 'progressPct',
      width: 180,
      sorter: (a, b) => a.progressPct - b.progressPct,
      render: (v: number, r) => <Progress percent={Math.round(v * 10) / 10} size="small" status={v >= 100 ? 'success' : r.isDelayed ? 'exception' : 'active'} aria-label={`${Math.round(v * 10) / 10}% done`} />,
    },
    { title: 'Planned start', dataIndex: 'plannedStart', width: 120, render: (v) => formatDate(v), sorter: (a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '') },
    {
      title: 'Planned end',
      dataIndex: 'plannedEnd',
      width: 130,
      render: (v, r) => (
        <div>
          {formatDate(v)}
          {r.baselineEnd && v && r.baselineEnd !== v ? <div className="text-muted" style={{ fontSize: 12 }}>baseline {formatDate(r.baselineEnd)}</div> : null}
        </div>
      ),
    },
    { title: 'Responsible', dataIndex: 'responsibleName', width: 150, render: (v) => v ?? <span className="text-muted">-</span> },
    ...(editor
      ? [
          {
            title: '',
            key: 'actions',
            fixed: 'right' as const,
            width: 90,
            render: (_: unknown, r: ActivityDto) => (
              <Space size={4}>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                />
                <Popconfirm title="Delete this activity?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => del.mutate(r.id)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span className="text-muted">
          {data?.length ?? 0} activities · {data?.filter((a) => a.isDelayed).length ?? 0} delayed · {data?.filter((a) => a.progressPct >= 100).length ?? 0} completed
        </span>
        <Space>
        <ExportButton
          onExport={async () => {
            await downloadXlsx(exportFileName('activities'), 'Activities', ACTIVITY_EXPORT, data ?? []);
            return data?.length ?? 0;
          }}
        />
        {editor && project ? <Button onClick={() => setTemplateOpen(true)}>Add from template</Button> : null}
        {editor && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Add activity
          </Button>
        )}
        </Space>
      </div>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Table<ActivityDto> rowKey="id" loading={isLoading} columns={columns} dataSource={data ?? []} size="middle" pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 1100 }} />
      {project ? <ApplyTemplateModal open={templateOpen} onClose={() => setTemplateOpen(false)} project={project} existing={(data ?? []).map((a) => a.name)} /> : null}
      <ActivityFormModal open={formOpen} onClose={() => setFormOpen(false)} projectId={projectId} activity={editing} members={members} />
    </div>
  );
}
