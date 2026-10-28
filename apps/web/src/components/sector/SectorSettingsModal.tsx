'use client';

import React, { useEffect } from 'react';
import { App, Form, Input, Select, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_FLOORS, formatChainage, parseChainage, sectorKinds, type ProjectDetail } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { FormGrid, FormShell } from '@/components/form/FormShell';

interface FormValues {
  chainageStart?: string;
  chainageEnd?: string;
  floors?: string[];
  villages?: string[];
}

const chainageRule = { validator: (_: unknown, v?: string) => (!v || parseChainage(v) !== null ? Promise.resolve() : Promise.reject(new Error('Like 12+000'))) };

/** The project's length (road, pipeline), floors (building) or villages (water supply) that site entries are tagged with. */
export function SectorSettingsModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectDetail }) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const k = sectorKinds(project);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      chainageStart: project.chainageStart !== null ? formatChainage(project.chainageStart) : undefined,
      chainageEnd: project.chainageEnd !== null ? formatChainage(project.chainageEnd) : undefined,
      floors: project.floors.length ? project.floors : DEFAULT_FLOORS,
      villages: project.villages,
    });
  }, [open, project, form]);

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const body: Record<string, unknown> = {};
      if (k.chainage) {
        body.chainageStart = parseChainage(v.chainageStart);
        body.chainageEnd = parseChainage(v.chainageEnd);
      }
      if (k.floor) body.floors = v.floors ?? [];
      if (k.village) body.villages = v.villages ?? [];
      return (await api.patch<ProjectDetail>(`/projects/${project.id}`, body)).data;
    },
    onSuccess: () => {
      message.success('Sector settings saved');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['sector', project.id] });
    },
    meta: FAIL_NOTICE,
  });

  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title="Sector settings" okText="Save" onSubmit={(v) => save.mutateAsync(v)}>
      <Form form={form} layout="vertical">
        {k.chainage ? (
          <>
            <Typography.Paragraph type="secondary">{project.pipeNetwork ? 'The length of the main the strip chart draws (optional).' : `The stretch of ${project.type === 'ROAD' ? 'road' : 'work'} in the contract.`}</Typography.Paragraph>
            <FormGrid cols={2}>
              <Form.Item name="chainageStart" label="Chainage from" rules={[chainageRule]}>
                <Input placeholder="12+000" />
              </Form.Item>
              <Form.Item
                name="chainageEnd"
                label="Chainage to"
                dependencies={['chainageStart']}
                rules={[
                  chainageRule,
                  ({ getFieldValue }) => ({
                    validator: (_, v?: string) => {
                      const a = parseChainage(getFieldValue('chainageStart'));
                      const b = parseChainage(v);
                      return a === null || b === null || b > a ? Promise.resolve() : Promise.reject(new Error('Must be after the start'));
                    },
                  }),
                ]}
              >
                <Input placeholder="28+000" />
              </Form.Item>
            </FormGrid>
          </>
        ) : null}
        {k.floor ? (
          <Form.Item name="floors" label="Floors, bottom up" extra="Type a floor and press Enter. Site entries pick one of these.">
            <Select mode="tags" tokenSeparators={[',']} open={false} placeholder="Foundation, plinth, ground floor…" />
          </Form.Item>
        ) : null}
        {k.village ? (
          <Form.Item name="villages" label="Villages" extra="Type a village and press Enter. Site entries pick one of these.">
            <Select mode="tags" tokenSeparators={[',']} open={false} placeholder="Village names" />
          </Form.Item>
        ) : null}
      </Form>
    </FormShell>
  );
}
