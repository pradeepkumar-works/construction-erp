'use client';

import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Card, Typography, theme } from 'antd';
import { PROJECT_TYPE_LABELS, WORK_ELEMENT_TYPE_LABELS, canManageTemplates, type ComponentKindDto, type ProjectTypeDto } from '@erp/shared';
import { DownloadOutlined, ImportOutlined, PlusOutlined } from '@/components/common/icons';
import { AppTabs } from '@/components/common/AppTabs';
import { EmptyLine } from '@/components/common/EmptyArt';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { ImportTypes, saveBundle } from '@/components/project-types/ImportTypes';
import { KindEditor } from '@/components/project-types/KindEditor';
import { NewKindForm, NewTypeForm } from '@/components/project-types/TypeForms';
import { TypeStateTag } from '@/components/project-types/TypeStateTag';
import { UpdateProjects } from '@/components/project-types/UpdateProjects';
import { useAuth } from '@/lib/auth';
import { exportComponentKinds, useComponentKinds, useProjectTypes } from '@/lib/queries';

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

const count = (n: number) => <span translate="no">{n}</span>;

function TypesTab({ types }: { types: ProjectTypeDto[] }) {
  const router = useRouter();
  const columns = useMemo<ListColumn<ProjectTypeDto & { id: string }>[]>(
    () => [
      {
        key: 'name',
        title: 'Type',
        locked: true,
        card: 'title',
        cardText: (t) => t.name,
        render: (_, t) => (
          <div>
            <Link href={`/project-types/${t.code}`} className="link-strong" data-record-link>
              {t.name}
            </Link>
            <Sub>{t.description || <span translate="no">{t.code}</span>}</Sub>
          </div>
        ),
      },
      { key: 'state', title: 'State', width: 120, card: 'status', render: (_, t) => <TypeStateTag standard={t.standard} edited={t.edited} active={t.active} /> },
      { key: 'base', title: 'Built on', width: 140, card: 'meta', cardText: (t) => PROJECT_TYPE_LABELS[t.baseType], render: (_, t) => PROJECT_TYPE_LABELS[t.baseType] },
      { key: 'components', title: 'Components', width: 120, align: 'right', render: (_, t) => count(t.breakdown.reduce((n, b) => n + (b.parentKey ? 0 : b.count), 0)) },
      { key: 'activities', title: 'Activities', width: 110, align: 'right', render: (_, t) => count(t.activities.length) },
      { key: 'projects', title: 'Projects', width: 100, align: 'right', render: (_, t) => count(t.projects) },
      { key: 'code', title: 'Code', width: 180, defaultHidden: true, render: (_, t) => <span translate="no">{t.code}</span> },
    ],
    [],
  );
  const rows = useMemo(() => types.map((t) => ({ ...t, id: t.code })), [types]);
  const choice = useColumnChoice('project-types', columns);
  return (
    <DataTable<ProjectTypeDto & { id: string }>
      columns={columns}
      visible={choice.visible}
      onChooseColumns={choice.setChosen}
      chosenIsDefault={choice.isDefault}
      rows={rows}
      table={{ pagination: false }}
      onOpen={(code) => router.push(`/project-types/${code}`)}
      scrollX={900}
      emptyText={<EmptyLine title="No project types yet" />}
    />
  );
}

function KindsTab({ kinds, onOpen }: { kinds: ComponentKindDto[]; onOpen: (k: ComponentKindDto) => void }) {
  const columns = useMemo<ListColumn<ComponentKindDto & { id: string }>[]>(
    () => [
      {
        key: 'name',
        title: 'Component kind',
        locked: true,
        card: 'title',
        cardText: (k) => k.name,
        render: (_, k) => (
          <div>
            <strong>{k.name}</strong>
            <Sub>
              <span translate="no">{k.code}</span>
            </Sub>
          </div>
        ),
      },
      { key: 'state', title: 'State', width: 120, card: 'status', render: (_, k) => <TypeStateTag standard={k.standard} edited={k.edited} active={k.active} /> },
      { key: 'base', title: 'Built on', width: 170, card: 'meta', cardText: (k) => WORK_ELEMENT_TYPE_LABELS[k.elementType], render: (_, k) => WORK_ELEMENT_TYPE_LABELS[k.elementType] },
      { key: 'specs', title: 'Specs', width: 90, align: 'right', render: (_, k) => count(k.specFields.length) },
      { key: 'steps', title: 'Steps', width: 90, align: 'right', render: (_, k) => count(k.steps.length) },
      { key: 'components', title: 'Laid out', width: 110, align: 'right', render: (_, k) => count(k.components) },
    ],
    [],
  );
  const rows = useMemo(() => kinds.map((k) => ({ ...k, id: k.code })), [kinds]);
  const choice = useColumnChoice('component-kinds', columns);
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        What a component is made of: the specs the planner fills in and the steps that become its activities. Changing a kind changes new components; Update projects in the kind gives its new steps to those laid out before.
      </Typography.Paragraph>
      <DataTable<ComponentKindDto & { id: string }>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={rows}
        table={{ pagination: rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false }}
        onOpen={(code) => {
          const k = kinds.find((x) => x.code === code);
          if (k) onOpen(k);
        }}
        scrollX={900}
        emptyText={<EmptyLine title="No component kinds yet" />}
      />
    </>
  );
}

function ProjectTypes() {
  const { user } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = search.get('tab') === 'kinds' ? 'kinds' : 'types';
  const types = useProjectTypes();
  const kinds = useComponentKinds();
  const [making, setMaking] = useState<'type' | 'kind' | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [updatingKind, setUpdatingKind] = useState<ComponentKindDto | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { message } = App.useApp();
  const editable = !!user && canManageTemplates(user.roleKey);
  const setTab = (k: string) => router.replace(k === 'kinds' ? `${pathname}?tab=kinds` : pathname, { scroll: false });
  const edited = kinds.data?.some((k) => k.edited);
  const newButton = editable ? (
    <>
      {tab === 'kinds' ? (
        <Button
          icon={<DownloadOutlined />}
          loading={exporting}
          disabled={!edited}
          title={edited ? 'The kinds your company made or changed' : 'Every kind is the built-in one'}
          onClick={async () => {
            setExporting(true);
            try {
              saveBundle(await exportComponentKinds(), 'component-kinds');
            } catch {
              message.error('The file could not be made. Try again in a moment.');
            } finally {
              setExporting(false);
            }
          }}
        >
          Export kinds
        </Button>
      ) : null}
      <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
        Import
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setMaking(tab === 'kinds' ? 'kind' : 'type')}>
        {tab === 'kinds' ? 'New component kind' : 'New project type'}
      </Button>
    </>
  ) : null;
  const failed = types.error ?? kinds.error;

  return (
    <div className="page-container">
      <PageHeader
        title="Project types"
        subtitle={`What a new project of each type starts with: its components, their activities, and the activities outside them.${editable ? '' : ' Admin and management can change them.'}`}
        extra={newButton}
      />
      {failed ? (
        <QueryError error={failed} onRetry={() => (types.error ? types.refetch() : kinds.refetch())} />
      ) : !types.data || !kinds.data ? (
        <PageSkeleton shape="list" header={false} />
      ) : (
        <Card size="small">
          <AppTabs
            variant="page"
            activeKey={tab}
            onChange={setTab}
            items={[
              { key: 'types', label: 'Types', count: types.data.length, countLabel: 'types', children: <TypesTab types={types.data} /> },
              { key: 'kinds', label: 'Component kinds', count: kinds.data.length, countLabel: 'kinds', children: <KindsTab kinds={kinds.data} onOpen={(k) => setOpenKind(k.code)} /> },
            ]}
          />
        </Card>
      )}
      <NewTypeForm open={making === 'type'} onClose={() => setMaking(null)} types={types.data ?? []} />
      <NewKindForm
        open={making === 'kind'}
        onClose={() => setMaking(null)}
        kinds={kinds.data ?? []}
        onMade={(code) => {
          setMaking(null);
          setOpenKind(code);
        }}
      />
      <KindEditor
        kind={kinds.data?.find((k) => k.code === openKind) ?? null}
        editable={editable}
        onClose={() => setOpenKind(null)}
        onUpdateProjects={(k) => {
          setOpenKind(null);
          setUpdatingKind(k);
        }}
      />
      {editable ? <ImportTypes open={importing} onClose={() => setImporting(false)} /> : null}
      {updatingKind ? <UpdateProjects what="kind" code={updatingKind.code} name={updatingKind.name} open onClose={() => setUpdatingKind(null)} /> : null}
    </div>
  );
}

/**
 * Project types (item 134, ARCHITECTURE "Project types"): the company's types (the standard ones, its copies and its own)
 * and the library of component kinds they are built from.
 */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="list" />}>
      <ProjectTypes />
    </Suspense>
  );
}
