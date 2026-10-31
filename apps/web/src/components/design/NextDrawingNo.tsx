'use client';

import React, { useState } from 'react';
import { App, Button, Form, Tooltip, type FormInstance } from 'antd';
import type { DocumentDiscipline } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';

/**
 * Fills the number box with the next number in the company's scheme (project, discipline, serial: "BLD-2026-02-STR-007"),
 * on a tap, for a new drawing in the register or the schedule.
 */
export function NextDrawingNo({ form, projectId }: { form: FormInstance; projectId?: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const watched = Form.useWatch('projectId', form) as string | undefined;
  const discipline = (Form.useWatch('discipline', form) as DocumentDiscipline | undefined) ?? 'GENERAL';
  const project = watched ?? projectId;
  const fill = async () => {
    if (!project) return;
    setBusy(true);
    try {
      const { docNo } = (await api.get<{ docNo: string }>('/design/next-no', { params: { projectId: project, discipline } })).data;
      form.setFieldValue('docNo', docNo);
      await form.validateFields(['docNo']).catch(() => undefined);
    } catch (e) {
      message.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title={project ? "The next number in the company's scheme for this discipline" : 'Choose the project first'}>
      <Button onClick={fill} loading={busy} disabled={!project}>
        Next number
      </Button>
    </Tooltip>
  );
}
