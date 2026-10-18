'use client';

import React, { useCallback, useState } from 'react';
import { App, Avatar, Button, Dropdown, Empty, Flex, Listy, Space, Tag, Typography } from 'antd';
import { EllipsisOutlined, UserAddOutlined, UserDeleteOutlined } from '@ant-design/icons';
import type { ProjectDetail, UserSummary } from '@erp/shared';
import { canEditProjects } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { UserSelect } from '@/components/common/SearchSelect';
import { Section } from '@/components/common/Section';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { ListRowMeta } from '@/components/common/ListRowMeta';
import { themeFontSize } from '@/lib/theme';

export function MembersCard({ project }: { project: ProjectDetail }) {
  const { user } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
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

  // Removing someone is in each row's More menu (UX item 85), not a red button on every row, and asks first by name.
  const confirmRemove = (m: { userId: string; fullName: string }) =>
    modal.confirm({
      title: `Remove ${m.fullName} from ${project.name}?`,
      content: `${m.fullName} comes off this project's team. You can add them again later.`,
      okText: 'Remove',
      okButtonProps: { danger: true },
      cancelText: 'Keep',
      onOk: () => remove.mutateAsync(m.userId),
    });

  // People already on the team are not offered again.
  const onTeam = useCallback((u: UserSummary) => u.id === project.projectManagerId || project.members.some((m) => m.userId === u.id), [project]);

  const members = [
    ...(project.projectManagerName
      ? [{ id: 'pm', userId: project.projectManagerId ?? '', fullName: project.projectManagerName, roleKey: 'PROJECT_MANAGER' as const, roleName: 'Project Manager', isPm: true }]
      : []),
    ...project.members.map((m) => ({ ...m, isPm: false })),
  ];

  return (
    <Section
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
          <UserSelect exclude={onTeam} placeholder="Type a name" aria-label="User" value={userId} onChange={setUserId} style={{ flex: 1 }} />
          <Button type="primary" disabled={!userId} loading={add.isPending} onClick={() => userId && add.mutate(userId)}>
            Add
          </Button>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
        </Space.Compact>
      )}
      {members.length ? (
        <Listy
          items={members}
          rowKey="id"
          styles={{ item: { padding: '8px 0', background: 'transparent' } }}
          itemRender={(m) => (
            <Flex gap="middle" align="center">
              <ListRowMeta
                avatar={
                  <Avatar size="small" style={{ background: m.isPm ? BRAND.colors.accent : undefined }}>
                    {m.fullName
                      .split(' ')
                      .map((s) => s[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Avatar>
                }
                title={
                  <span style={{ fontSize: themeFontSize('fontSize') }}>
                    {m.fullName} {m.isPm && <Tag color="gold" style={{ marginLeft: 4 }}>PM</Tag>}
                  </span>
                }
                description={<Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>{m.roleName}</Typography.Text>}
              />
              {editor && !m.isPm ? (
                <Dropdown
                  trigger={['click']}
                  placement="bottomRight"
                  menu={{ items: [{ key: 'remove', icon: <UserDeleteOutlined />, label: 'Remove from project', danger: true, onClick: () => confirmRemove(m) }] }}
                >
                  <Button size="small" type="text" icon={<EllipsisOutlined />} aria-label={`More actions for ${m.fullName}`} />
                </Dropdown>
              ) : null}
            </Flex>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No team members yet" />
      )}
    </Section>
  );
}
