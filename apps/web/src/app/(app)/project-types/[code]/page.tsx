'use client';

import React, { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Card, Descriptions, Popconfirm, Result, Table, Typography } from 'antd';
import {
  CONTRACT_MODEL_LABELS,
  PROJECT_TYPE_LABELS,
  WORK_LOCATION_LABELS,
  canManageTemplates,
  kindPlan,
  type ComponentKindDto,
  type ProjectTypeDto,
  type StartComponent,
} from '@erp/shared';
import { DeleteOutlined, DownloadOutlined, EditOutlined, SyncOutlined } from '@/components/common/icons';
import { AppTabs } from '@/components/common/AppTabs';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { DprFormTab } from '@/components/project-types/DprFormTab';
import { saveBundle } from '@/components/project-types/ImportTypes';
import { TypeEditor } from '@/components/project-types/TypeEditor';
import { TypeStateTag } from '@/components/project-types/TypeStateTag';
import { UpdateProjects } from '@/components/project-types/UpdateProjects';
import { TemplateEditor } from '@/components/templates/TemplateEditor';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { exportProjectType, useActivityTemplates, useComponentKinds, useProjectTypes, useRemoveProjectType } from '@/lib/queries';

type Row = StartComponent & { children?: Row[] };

/** The starting breakdown as a tree, each component with its kind and what it lays out. */
function Breakdown({ type, kinds }: { type: ProjectTypeDto; kinds: ComponentKindDto[] }) {
  const rows = useMemo<Row[]>(() => {
    const top = type.breakdown.filter((b) => !b.parentKey).map((b) => ({ ...b }) as Row);
    for (const t of top) {
      const subs = type.breakdown.filter((b) => b.parentKey === t.key);
      if (subs.length) t.children = subs;
    }
    return top;
  }, [type.breakdown]);
  const kindOf = (code: string) => kinds.find((k) => k.code === code);
  if (!rows.length)
    return (
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        No starting components. A new project of this type starts with its activities only; components are added on its Components tab.
      </Typography.Paragraph>
    );
  return (
    <Table<Row>
      size="small"
      rowKey="key"
      pagination={false}
      dataSource={rows}
      scroll={{ x: 760 }}
      // The tree's indent and toggle sit with the component's name, not its number.
      expandable={{ defaultExpandAllRows: true, expandIconColumnIndex: 1 }}
      columns={[
        { key: 'key', title: 'No.', dataIndex: 'key', width: 70, render: (v: string) => <span translate="no">{v}</span> },
        { key: 'name', title: 'Component', dataIndex: 'name' },
        { key: 'kind', title: 'Component type', width: 220, render: (_, b) => kindOf(b.kind)?.name ?? <span className="text-muted">A type that was removed</span> },
        { key: 'count', title: 'Copies', dataIndex: 'count', width: 90, align: 'right', render: (v: number, b) => (b.parentKey ? <span className="text-muted">Each</span> : <span translate="no">{v}</span>) },
        { key: 'weight', title: 'Weight', dataIndex: 'weightPct', width: 100, align: 'right', render: (v: number | null | undefined) => (v === null || v === undefined ? <span className="text-muted">By BOQ</span> : <span translate="no">{v}%</span>) },
        { key: 'acts', title: 'Activities', width: 100, align: 'right', render: (_, b) => <span translate="no">{kindOf(b.kind) ? kindPlan(kindOf(b.kind)!, b.specs ?? null).length : 0}</span> },
      ]}
    />
  );
}

/** One project type (item 134): its settings and starting breakdown, its loose activities and its DPR form. */
export default function Page() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  // ?tab=dpr-form opens the DPR form (the link from a DPR's record).
  const tab = useSearchParams().get('tab') ?? undefined;
  const { message } = App.useApp();
  const { user } = useAuth();
  const types = useProjectTypes();
  const kinds = useComponentKinds();
  const templates = useActivityTemplates();
  const remove = useRemoveProjectType();
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const editable = !!user && canManageTemplates(user.roleKey);
  const type = types.data?.find((t) => t.code === code);
  const template = templates.data?.find((t) => t.typeCode === code);
  const crumbs = [{ title: 'Project types', href: '/project-types' }, { title: type?.name ?? code }];

  const failed = types.error ?? kinds.error ?? templates.error;
  if (failed) return <QueryError error={failed} onRetry={() => [types, kinds, templates].forEach((q) => q.error && q.refetch())} />;
  if (!types.data || !kinds.data || !templates.data) return <PageSkeleton shape="record" />;
  if (!type)
    return (
      <div className="page-container">
        <PageHeader title="Project type not found" crumbs={crumbs} />
        <Result icon={<ResultMark kind="not-found" />} title="No project type with this code" subTitle="It may have been deleted. Pick one from Project types." />
      </div>
    );

  const actions = editable ? (
    <>
      {type.standard && type.edited ? (
        <Popconfirm
          title={`Go back to the standard ${type.name}?`}
          description="Your changes to its settings, breakdown and activities are removed. Its projects stay as they are."
          okText="Go back to standard"
          okButtonProps={{ danger: true }}
          onConfirm={async () => {
            await remove.mutateAsync(type.code);
            message.success(`${type.name} is back to the standard one`);
          }}
        >
          <Button>Reset to standard</Button>
        </Popconfirm>
      ) : null}
      {!type.standard ? (
        <ConfirmDelete
          what={type.name}
          disabled={type.projects > 0}
          description="Projects can no longer be made from it."
          onConfirm={() => remove.mutateAsync(type.code)}
          onDone={() => router.push('/project-types')}
        >
          <Button danger icon={<DeleteOutlined />} disabled={type.projects > 0} title={type.projects ? 'Projects use it; archive it from Edit instead' : undefined}>
            Delete
          </Button>
        </ConfirmDelete>
      ) : null}
      <Button
        icon={<DownloadOutlined />}
        loading={exporting}
        onClick={async () => {
          setExporting(true);
          try {
            saveBundle(await exportProjectType(type.code), type.name);
          } catch {
            message.error('The file could not be made. Try again in a moment.');
          } finally {
            setExporting(false);
          }
        }}
      >
        Export
      </Button>
      {type.projects > 0 ? (
        <Button icon={<SyncOutlined />} onClick={() => setUpdating(true)}>
          Update projects
        </Button>
      ) : null}
      <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>
        Edit
      </Button>
    </>
  ) : null;

  const offered = type.kinds.map((k) => kinds.data.find((x) => x.code === k)?.name ?? k);

  return (
    <div className="page-container">
      <PageHeader
        title={
          <span>
            {type.name} <TypeStateTag standard={type.standard} edited={type.edited} active={type.active} />
          </span>
        }
        docTitle={type.name}
        subtitle={type.description || undefined}
        crumbs={crumbs}
        extra={actions}
      />
      <Card size="small">
        <AppTabs
          variant="page"
          defaultActiveKey={tab}
          items={[
            {
              key: 'breakdown',
              label: 'Setup and components',
              children: (
                <>
                  <Descriptions
                    size="small"
                    column={{ xs: 1, sm: 2, lg: 3 }}
                    style={{ margin: '12px 0 16px' }}
                    items={[
                      { key: 'base', label: 'Based on', children: PROJECT_TYPE_LABELS[type.baseType] },
                      { key: 'code', label: 'Code', children: <span translate="no">{type.code}</span> },
                      { key: 'contract', label: 'Usual contract', children: CONTRACT_MODEL_LABELS[type.contractModel] },
                      { key: 'locations', label: 'Work is located by', children: type.locations.length ? type.locations.map((l) => WORK_LOCATION_LABELS[l]).join(', ') : 'Not by place' },
                      { key: 'pipes', label: 'Pipe network', children: type.pipeNetwork ? 'Yes' : 'No' },
                      { key: 'projects', label: 'Projects', children: <span translate="no">{type.projects}</span> },
                      { key: 'kinds', label: 'Component types offered first', span: 'filled', children: offered.length ? offered.join(', ') : 'Every component type' },
                      ...(type.updatedAt ? [{ key: 'updated', label: 'Last changed', children: `${formatDateTime(type.updatedAt)}${type.updatedByName ? ` by ${type.updatedByName}` : ''}` }] : []),
                    ]}
                  />
                  <Breakdown type={type} kinds={kinds.data} />
                </>
              ),
            },
            {
              key: 'activities',
              label: 'Activities',
              count: type.activities.length,
              countLabel: 'activities',
              children: template ? <TemplateEditor template={template} editable={editable} standard={type.standard} /> : null,
            },
            {
              key: 'dpr-form',
              label: 'DPR form',
              children: <DprFormTab type={type} editable={editable} />,
            },
          ]}
        />
      </Card>
      {editable ? <TypeEditor type={type} kinds={kinds.data} open={editing} onClose={() => setEditing(false)} /> : null}
      {editable && type.projects > 0 ? <UpdateProjects what="type" code={type.code} name={type.name} open={updating} onClose={() => setUpdating(false)} /> : null}
    </div>
  );
}
