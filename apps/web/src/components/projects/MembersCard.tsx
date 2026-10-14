'use client';

import React, { useState } from 'react';
import { App, Avatar, Button, Card, List, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import type { ProjectDetail } from '@erp/shared';
import { canEditProjects } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useUsers } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

export function MembersCard({ project }: { project: ProjectDetail }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: users } = useUsers();
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const editor = !!user && canEditProjects(user.roleKey) && user.roleKey !== 'QUANTITY_SURVEYOR';

  const add = useMutation({
    mutationFn: async (uid: string) => api.post(`/projects/${project.id}/members`, { userId: uid }),
    onSuccess: () => {
      message.success('Member added');
      setUserId(undefined);
      setAdding(false);
      qc.invalidateQueries({ queryKey: ['projects', project.id] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: async (uid: string) => api.delete(`/projects/${project.id}/members/${uid}`),
    onSuccess: () => {
      message.success('Member removed');
      qc.invalidateQueries({ queryKey: ['projects', project.id] });
    },
    onError: (err) => message.error(errorMessage(err)),
  });

  const memberIds = new Set(project.members.map((m) => m.userId));
  const candidates = (users ?? []).filter((u) => u.isActive && !memberIds.has(u.id) && u.id !== project.projectManagerId);

  return (
    <Card
      size="small"
      title={`Team (${project.members.length})`}
      extra={
        editor && !adding ? (
          <Button size="small" icon={<UserAddOutlined />} onClick={() => setAdding(true)}>
            Add
          </Button>
        ) : null
      }
    >
      {adding && (
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Select showSearch optionFilterProp="label" placeholder="Select user" value={userId} onChange={setUserId} style={{ flex: 1 }} options={candidates.map((u) => ({ value: u.id, label: `${u.fullName} · ${u.roleName}` }))} />
          <Button type="primary" disabled={!userId} loading={add.isPending} onClick={() => userId && add.mutate(userId)}>
            Add
          </Button>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
        </Space.Compact>
      )}
      <List
        size="small"
        dataSource={[
          ...(project.projectManagerName
            ? [{ id: 'pm', userId: project.projectManagerId ?? '', fullName: project.projectManagerName, roleKey: 'PROJECT_MANAGER' as const, roleName: 'Project Manager', isPm: true }]
            : []),
          ...project.members.map((m) => ({ ...m, isPm: false })),
        ]}
        locale={{ emptyText: 'No team members yet' }}
        renderItem={(m) => (
          <List.Item
            style={{ paddingInline: 0 }}
            actions={
              editor && !m.isPm
                ? [
                    <Popconfirm key="rm" title={`Remove ${m.fullName} from the project?`} okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(m.userId)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <List.Item.Meta
              avatar={
                <Avatar size="small" style={{ background: m.isPm ? BRAND.colors.accentDeep : BRAND.colors.primary }}>
                  {m.fullName
                    .split(' ')
                    .map((s) => s[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Avatar>
              }
              title={
                <span style={{ fontSize: 13 }}>
                  {m.fullName} {m.isPm && <Tag color="gold" style={{ marginLeft: 4 }}>PM</Tag>}
                </span>
              }
              description={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{m.roleName}</Typography.Text>}
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
