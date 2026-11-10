'use client';

import React, { useEffect } from 'react';
import { HelpLink } from '@/components/common/Help';
import { App, Form, Select } from 'antd';
import type { UserSummary } from '@erp/shared';
import { useSetPositions } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { HEAD_OFFICE, ProjectSelect } from '@/components/common/ProjectSelect';
import { useMasterOptions } from '@/components/quality/NcrFormModal';

interface Values {
  positions: { positionCode?: string; projectId?: string }[];
}

/**
 * The positions someone holds, each on a project or at head office. Approval rules can name a position, so whoever
 * holds it decides that level; a position never changes what their role lets them see or do.
 */
export function PositionsModal({ user, onClose }: { user: UserSummary | null; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const save = useSetPositions();
  const { options } = useMasterOptions('position', null, !!user);

  useEffect(() => {
    if (!user) return;
    form.resetFields();
    form.setFieldsValue({ positions: user.positions.map((p) => ({ positionCode: p.positionCode, projectId: p.projectId ?? HEAD_OFFICE })) });
  }, [user, form]);

  const submit = async (v: Values) => {
    const positions = (v.positions ?? []).filter((p) => p.positionCode).map((p) => ({ positionCode: p.positionCode!, projectId: !p.projectId || p.projectId === HEAD_OFFICE ? null : p.projectId }));
    const saved = await save.mutateAsync({ userId: user!.id, positions });
    message.success(saved.positions.length ? `${saved.fullName}: ${saved.positions.length} position${saved.positions.length === 1 ? '' : 's'}` : `${saved.fullName} holds no positions`);
    return saved;
  };

  return (
    <FormShell open={!!user} onClose={onClose} form={form} layout="modal" title={user ? `Positions of ${user.fullName}` : 'Positions'} okText="Save positions" onSubmit={submit} width={720} projectDefault={false}>
      <Form form={form} layout="vertical">
        <HelpLink>Approval rules can name a position: whoever holds it on the entry&apos;s project, or at head office, decides that level. What they see still comes from their role; a position on a project adds them to its team.</HelpLink>
        <LineTable
          name="positions"
          label="Position"
          addText="Add position"
          newLine={() => ({ projectId: HEAD_OFFICE })}
          columns={[
            {
              key: 'position',
              title: 'Position',
              render: (f) => (
                <Form.Item name={[f.name, 'positionCode']} noStyle rules={[{ required: true, message: 'Choose the position' }]}>
                  <Select aria-label="Position" showSearch={{ optionFilterProp: 'label' }} options={options} placeholder="Site in-charge, General manager…" style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
            {
              key: 'project',
              title: 'Where',
              width: 300,
              render: (f) => (
                <Form.Item name={[f.name, 'projectId']} noStyle rules={[{ required: true, message: 'Choose a project or Head office' }]}>
                  <ProjectSelect headOffice allowClear={false} placeholder="Head office or a project" aria-label="Where the position is held" style={{ width: '100%' }} />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </FormShell>
  );
}
