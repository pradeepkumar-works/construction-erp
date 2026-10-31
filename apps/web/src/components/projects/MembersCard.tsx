'use client';

import React, { useCallback, useState } from 'react';
import { App, Avatar, Button, Dropdown, Empty, Flex, Listy, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CopyOutlined, EllipsisOutlined, UserAddOutlined, UserDeleteOutlined } from '@/components/common/icons';
import type { ProjectDetail, UserSummary } from '@erp/shared';
import { canManageProjects } from '@erp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { UserMultiSelect } from '@/components/common/SearchSelect';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { Section } from '@/components/common/Section';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { ListRowMeta } from '@/components/common/ListRowMeta';
import { themeFontSize } from '@/lib/theme';

export function MembersCard({ project }: { project: ProjectDetail }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [askRemove, removeDialog] = useConfirmDelete();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [fromProject, setFromProject] = useState<string | undefined>();
  const editor = !!user && canManageProjects(user.roleKey);

  const done = (text: string) => {
    message.success(text);
    setUserIds([]);
    setFromProject(undefined);
    setAdding(false);
    qc.invalidateQueries({ queryKey: ['projects', project.id] });
  };
  // Several people at once, or everyone on another project (finding 6 of the October review).
  const add = useMutation({
    mutationFn: async (ids: string[]) => api.post(`/projects/${project.id}/members`, { userIds: ids }),
    onSuccess: (_, ids) => done(ids.length === 1 ? 'Added to the team' : `${ids.length} people added to the team`),
    meta: FAIL_NOTICE,
  });
  const copy = useMutation({
    mutationFn: async (from: string) => (await api.post<ProjectDetail>(`/projects/${project.id}/members/copy`, { fromProjectId: from })).data,
    onSuccess: (p) => {
      const n = p.members.length - project.members.length;
      done(n > 0 ? `${n} ${n === 1 ? 'person' : 'people'} added from that project's team` : 'Everyone on that team is already on this one');
    },
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async (uid: string) => api.delete(`/projects/${project.id}/members/${uid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', project.id] });
    },
    meta: FAIL_NOTICE,
  });

  // Removing someone is in each row's More menu (UX item 85), not a red button on every row, and asks first by name.
  // Undo adds them back, as adding them again would.
  const confirmRemove = (m: { userId: string; fullName: string }) =>
    askRemove({
      verb: 'Remove',
      what: `${m.fullName} from ${project.name}`,
      description: `${m.fullName} comes off this project's team. You can add them again later.`,
      notice: `${m.fullName} removed from the team`,
      onConfirm: () => remove.mutateAsync(m.userId),
      undo: async () => {
        await api.post(`/projects/${project.id}/members`, { userId: m.userId });
        await qc.invalidateQueries({ queryKey: ['projects', project.id] });
      },
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
      id="team"
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
        <Flex vertical gap="small" style={{ marginBottom: 12 }}>
          <UserMultiSelect exclude={onTeam} placeholder="Type names" aria-label="People to add" value={userIds} onChange={setUserIds} style={{ width: '100%' }} />
          <Flex gap="small" wrap>
            <Button type="primary" disabled={!userIds.length} loading={add.isPending} onClick={() => add.mutate(userIds)}>
              {userIds.length > 1 ? `Add ${userIds.length} people` : 'Add'}
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </Flex>
          <Flex gap="small" wrap align="center">
            <ProjectSelect
              allowClear
              placeholder="Or copy the team of a project"
              aria-label="Project to copy the team from"
              value={fromProject}
              onChange={setFromProject}
              style={{ flex: 1, minWidth: 200 }}
              exclude={project.id}
            />
            <Button icon={<CopyOutlined />} disabled={!fromProject} loading={copy.isPending} onClick={() => fromProject && copy.mutate(fromProject)}>
              Copy team
            </Button>
          </Flex>
        </Flex>
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
                    {m.fullName} {m.isPm && <AppTag tone="pending" style={{ marginLeft: 4 }}>PM</AppTag>}
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
      {removeDialog}
    </Section>
  );
}
