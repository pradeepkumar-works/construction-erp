'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Flex, Popconfirm, Segmented, Table, Typography, theme } from 'antd';
import { normaliseDprForm, standardDprForm, type DprFormDef, type ProjectTypeDto } from '@erp/shared';
import { EditOutlined } from '@/components/common/icons';
import { QueryError } from '@/components/common/QueryState';
import { formatDateTime } from '@/lib/format';
import { useDprForm, useResetDprForm } from '@/lib/queries';
import { DprFormEditor } from './DprFormEditor';
import { DprFormPreview, type PreviewMode } from './DprFormPreview';

/**
 * A project type's DPR form (item 134 part 2): the form the next report on its projects takes, seen as the web or the
 * phone shows it, with its saved versions and how many reports each holds.
 */
export function DprFormTab({ type, editable }: { type: ProjectTypeDto; editable: boolean }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const q = useDprForm(type.code);
  const reset = useResetDprForm();
  const [mode, setMode] = useState<PreviewMode>('web');
  const [editing, setEditing] = useState(false);
  const standard = useMemo<DprFormDef>(() => normaliseDprForm(standardDprForm(type.code, type.baseType)), [type.code, type.baseType]);
  // The editor holds a field's kind and place to every version saved (the server checks the same).
  const saved = useMemo(() => (q.data ? [standard, ...(q.data.form.standard ? [] : [q.data.form.def])] : [standard]), [q.data, standard]);

  if (q.error) return <QueryError error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Typography.Paragraph type="secondary">Loading the form…</Typography.Paragraph>;
  const { form, versions, progressFromDpr } = q.data;
  const asStandard = JSON.stringify(form.def) === JSON.stringify(standard);
  const projects = type.projects === 1 ? 'the 1 project' : `the ${type.projects} projects`;

  return (
    <div style={{ paddingTop: token.paddingSM }}>
      <Flex justify="space-between" align="start" gap={token.margin} wrap>
        <div style={{ flex: '1 1 320px' }}>
          <Typography.Paragraph style={{ marginBottom: token.marginXXS }}>
            {form.standard ? (
              <>The standard form of {type.name}. </>
            ) : (
              <>
                Version <span translate="no">{form.version}</span>, saved {form.createdAt ? formatDateTime(form.createdAt) : ''}
                {form.createdByName ? ` by ${form.createdByName}` : ''}
                {asStandard ? ', the same as the standard form. ' : '. '}
              </>
            )}
            The next report on {projects} of this type takes it; reports made already keep the form they were made on.
          </Typography.Paragraph>
          <Typography.Text type="secondary">
            {form.def.own.length ? `${form.def.own.length} field${form.def.own.length === 1 ? '' : 's'} of your own` : 'No fields of your own'}
            {form.def.minPhotos ? ` · at least ${form.def.minPhotos} photo${form.def.minPhotos === 1 ? '' : 's'}` : ''}
            {` · ${form.def.fields.filter((f) => f.show && f.required).length} required`}
          </Typography.Text>
        </div>
        {editable ? (
          <Flex gap={token.marginXS} wrap>
            {!form.standard && !asStandard ? (
              <Popconfirm
                title="Go back to the standard form?"
                description="It is saved as a new version. Reports made already keep theirs."
                okText="Go back to standard"
                onConfirm={async () => {
                  const v = await reset.mutateAsync(type.code);
                  message.success(`Version ${v.version} is the standard form again`);
                }}
              >
                <Button>Reset to standard</Button>
              </Popconfirm>
            ) : null}
            <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit form
            </Button>
          </Flex>
        ) : null}
      </Flex>

      <Flex justify="space-between" align="center" style={{ margin: `${token.marginLG}px 0 ${token.marginSM}px` }}>
        <Typography.Title level={2} style={{ margin: 0, fontSize: token.fontSizeHeading5 }}>
          Preview
        </Typography.Title>
        <Segmented aria-label="Preview as" value={mode} onChange={(m) => setMode(m as PreviewMode)} options={[{ value: 'web', label: 'Web' }, { value: 'phone', label: 'Phone' }]} />
      </Flex>
      <DprFormPreview def={form.def} mode={mode} locations={type.locations} progressFromDpr={progressFromDpr} />

      {versions.length ? (
        <>
          <Typography.Title level={2} style={{ margin: `${token.marginLG}px 0 ${token.marginSM}px`, fontSize: token.fontSizeHeading5 }}>
            Versions
          </Typography.Title>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={versions}
            scroll={{ x: 520 }}
            columns={[
              { key: 'version', title: 'Version', dataIndex: 'version', width: 90, render: (v: number) => <span translate="no">{v}</span> },
              { key: 'saved', title: 'Saved', dataIndex: 'createdAt', render: (v: string) => formatDateTime(v) },
              { key: 'by', title: 'By', dataIndex: 'createdByName', render: (v: string | null) => v ?? '—' },
              { key: 'reports', title: 'Reports on it', dataIndex: 'reports', width: 130, align: 'right', render: (v: number) => <span translate="no">{v}</span> },
            ]}
          />
        </>
      ) : null}
      {editable ? <DprFormEditor type={type} def={form.def} saved={saved} progressFromDpr={progressFromDpr} open={editing} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}
