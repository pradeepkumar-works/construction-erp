'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Checkbox, Modal, Table, Tag, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApplyTemplateResultDto, ProjectDetail } from '@erp/shared';
import { PROJECT_TYPE_LABELS, scheduleTemplate } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { useActivityTemplates } from '@/lib/queries';
import { formatDate, inSentence } from '@/lib/format';

/** Pick standard activities for the project's type and add the ones it does not have yet. */
export function ApplyTemplateModal({ open, onClose, project, existing }: { open: boolean; onClose: () => void; project: ProjectDetail; existing: string[] }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data: templates } = useActivityTemplates(open);
  const template = templates?.find((t) => t.projectType === project.type);
  const have = useMemo(() => new Set(existing.map((n) => n.trim().toLowerCase())), [existing]);
  const rows = useMemo(() => (template ? scheduleTemplate(template.items, project.startDate, project.endDate) : []), [template, project.startDate, project.endDate]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (open) setPicked(rows.filter((r) => !have.has(r.name.toLowerCase())).map((r) => r.name));
  }, [open, rows, have]);

  const apply = useMutation({
    mutationFn: async () => (await api.post<ApplyTemplateResultDto>(`/projects/${project.id}/activities/from-template`, { names: picked })).data,
    onSuccess: (r) => {
      message.success(`${r.created} activit${r.created === 1 ? 'y' : 'ies'} added${r.skipped.length ? `, ${r.skipped.length} already there` : ''}`);
      qc.invalidateQueries({ queryKey: ['activities', project.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Add ${inSentence(PROJECT_TYPE_LABELS[project.type])} activities from the template`}
      okText={`Add ${picked.length} activit${picked.length === 1 ? 'y' : 'ies'}`}
      okButtonProps={{ disabled: !picked.length }}
      confirmLoading={apply.isPending}
      onOk={() => apply.mutate()}
      width={760}
      destroyOnHidden
    >
      {!project.startDate ? <Alert type="info" showIcon style={{ marginBottom: 12 }} title="The project has no start date, so the activities are added without planned dates." /> : null}
      <Table
        rowKey="name"
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          {
            title: '',
            key: 'pick',
            width: 40,
            render: (_, r) => {
              const there = have.has(r.name.toLowerCase());
              return <Checkbox disabled={there} checked={!there && picked.includes(r.name)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.name] : p.filter((n) => n !== r.name)))} />;
            },
          },
          { title: 'Activity', dataIndex: 'name', render: (v: string) => (have.has(v.toLowerCase()) ? <Typography.Text type="secondary">{v} <Tag>already added</Tag></Typography.Text> : v) },
          { title: 'Unit', dataIndex: 'unit', width: 70 },
          { title: 'Planned start', dataIndex: 'plannedStart', width: 120, render: (v: string | null) => formatDate(v) },
          { title: 'Planned finish', dataIndex: 'plannedEnd', width: 120, render: (v: string | null) => formatDate(v) },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        Planned quantities start at 0: set them, or link each activity to its BOQ item, so progress can be weighted.
      </Typography.Paragraph>
    </Modal>
  );
}
