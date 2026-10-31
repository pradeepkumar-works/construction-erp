'use client';

import React, { useMemo, useState } from 'react';
import { Alert, Button, Dropdown, Flex, Progress, Space, Statistic, Table, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { TableProps } from 'antd';
import { DeleteOutlined, EditOutlined, FileExcelOutlined, MoreOutlined, PlusOutlined } from '@/components/common/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CONTRACT_MODEL_LABELS,
  WORK_ELEMENT_TYPE_LABELS,
  canEditProjects,
  type ProjectDetail,
  type StructureActivityDto,
  type StructureDto,
  type WorkElementDto,
} from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useAuth } from '@/lib/auth';
import { useStructure } from '@/lib/queries';
import { formatINR, formatQty, toNumber } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ExportButton } from '@/components/common/ExportButton';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { downloadXlsx, exportFileName } from '@/lib/exportExcel';
import { ElementFormDrawer } from './ElementFormDrawer';
import { StructureImportModal } from './StructureImportModal';

type Row =
  | { kind: 'element'; key: string; element: WorkElementDto; children?: Row[] }
  | { kind: 'activity'; key: string; activity: StructureActivityDto; children?: Row[] }
  | { kind: 'loose'; key: string; count: number; children?: Row[] };

/** The tree: components, their sub-components, then activities and their parts; work outside the breakdown last. */
function buildRows(s: StructureDto): Row[] {
  const actRow = (a: StructureActivityDto): Row => {
    const parts = s.activities.filter((p) => p.parentActivityId === a.id).map(actRow);
    return { kind: 'activity', key: a.id, activity: a, children: parts.length ? parts : undefined };
  };
  const elementIds = new Set(s.elements.map((e) => e.id));
  const elRow = (e: WorkElementDto): Row => {
    const subs = s.elements.filter((c) => c.parentId === e.id).map(elRow);
    const acts = s.activities.filter((a) => a.workElementId === e.id && !a.parentActivityId).map(actRow);
    const children = [...subs, ...acts];
    return { kind: 'element', key: e.id, element: e, children: children.length ? children : undefined };
  };
  const rows = s.elements.filter((e) => !e.parentId || !elementIds.has(e.parentId)).map(elRow);
  const loose = s.activities.filter((a) => !a.parentActivityId && (!a.workElementId || !elementIds.has(a.workElementId)));
  if (loose.length) rows.push({ kind: 'loose', key: 'loose', count: loose.length, children: loose.map(actRow) });
  return rows;
}

const pctBar = (v: number, label: string) => <Progress percent={v} size="small" status={v >= 100 ? 'success' : 'normal'} aria-label={`${label}: ${v}% done`} />;

/**
 * Structure tab (ARCHITECTURE "Work breakdown"): the project's components and sub-components with their
 * weights, the activities under each, and progress rolled up from the sub-activities to the project.
 */
export function StructurePanel({ project }: { project: ProjectDetail }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useStructure(project.id);
  const editor = !!user && canEditProjects(user.roleKey);
  const [form, setForm] = useState<{ element: WorkElementDto | null; parentId: string | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Folded to the components at first: twelve lines rather than four hundred.
  const [expanded, setExpanded] = useState<React.Key[]>([]);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const after = (next: StructureDto) => {
    qc.setQueryData(['activities', project.id, 'structure'], next);
    qc.invalidateQueries({ queryKey: ['activities', project.id] });
    qc.invalidateQueries({ queryKey: ['boq', project.id] });
  };
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete<StructureDto>(`/projects/${project.id}/structure/elements/${id}`)).data,
    onSuccess: after,
    meta: FAIL_NOTICE,
  });
  const reorder = useMutation({
    mutationFn: async (ids: string[]) => (await api.post<StructureDto>(`/projects/${project.id}/structure/elements/reorder`, { ids })).data,
    onSuccess: after,
    meta: FAIL_NOTICE,
  });

  const move = (e: WorkElementDto, by: -1 | 1) => {
    const siblings = (data?.elements ?? []).filter((x) => x.parentId === e.parentId);
    const i = siblings.findIndex((x) => x.id === e.id);
    const j = i + by;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  if (isLoading) return <PageSkeleton shape="list" header={false} />;
  if (error || !data) return <QueryError error={error ?? new Error('Structure not found')} onRetry={() => refetch()} />;

  const columns: TableProps<Row>['columns'] = [
    {
      title: 'Component or activity',
      key: 'name',
      render: (_, r) => {
        if (r.kind === 'loose') return <Typography.Text type="secondary">Outside the breakdown ({r.count})</Typography.Text>;
        if (r.kind === 'element') {
          const e = r.element;
          return (
            <div>
              <strong translate="no">{e.code}</strong> <strong>{e.name}</strong>
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {[WORK_ELEMENT_TYPE_LABELS[e.elementType], e.activityCount ? `${e.activityCount} activities` : 'No activities yet', e.boqCount ? `${e.boqCount} BOQ items` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
          );
        }
        const a = r.activity;
        return (
          <div>
            {a.parentActivityId ? a.name : <span style={{ fontWeight: 500 }}>{a.name}</span>}
            {!a.isSummary ? (
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }} translate="no">
                {formatQty(a.executedQty)} of {formatQty(a.plannedQty)} {a.unit}
                {toNumber(a.plannedQty) === 0 ? ' · no planned quantity yet' : ''}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: <Tooltip title="Share of its parent, %. In grey when worked out from BOQ value.">Weight</Tooltip>,
      key: 'weight',
      width: 90,
      align: 'right',
      className: 'mono',
      render: (_, r) => {
        if (r.kind === 'loose') return null;
        const given = r.kind === 'element' ? r.element.weightPct : r.activity.weightPct;
        const eff = r.kind === 'element' ? r.element.effectiveWeightPct : r.activity.effectiveWeightPct;
        return given !== null ? `${Math.round(Number(given) * 10) / 10}%` : <span className="text-muted">{eff}%</span>;
      },
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 200,
      render: (_, r) => (r.kind === 'element' ? pctBar(r.element.progressPct, r.element.name) : r.kind === 'activity' ? pctBar(r.activity.progressPct, r.activity.name) : null),
    },
    {
      title: 'BOQ amount',
      key: 'amount',
      width: 140,
      align: 'right',
      className: 'mono',
      render: (_, r) => (r.kind === 'element' && toNumber(r.element.boqAmount) ? formatINR(r.element.boqAmount) : null),
    },
    ...(editor
      ? [
          {
            title: '',
            key: 'actions',
            width: 92,
            fixed: 'right' as const,
            render: (_: unknown, r: Row) => {
              if (r.kind !== 'element') return null;
              const e = r.element;
              const siblings = data.elements.filter((x) => x.parentId === e.parentId);
              const i = siblings.findIndex((x) => x.id === e.id);
              return (
                <Space size={4}>
                  <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${e.code} ${e.name}`} onClick={() => setForm({ element: e, parentId: null })} />
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        ...(e.level === 'COMPONENT' ? [{ key: 'sub', label: 'Add a sub-component', icon: <PlusOutlined /> }] : []),
                        { key: 'up', label: 'Move up', disabled: i <= 0 },
                        { key: 'down', label: 'Move down', disabled: i < 0 || i >= siblings.length - 1 },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'sub') setForm({ element: null, parentId: e.id });
                        if (key === 'up') move(e, -1);
                        if (key === 'down') move(e, 1);
                      },
                    }}
                  >
                    <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More for ${e.code} ${e.name}`} />
                  </Dropdown>
                  <ConfirmDelete
                    what={`${e.code} ${e.name}`}
                    description="Its sub-components go too. Its activities and BOQ items stay, outside the breakdown."
                    onConfirm={() => del.mutateAsync(e.id)}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${e.code} ${e.name}`} />
                  </ConfirmDelete>
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  const exportRows = () => {
    const out: { level: string; code: string; name: string; kind: string; weight: string; effective: number; unit: string; planned: string; done: string; pct: number; amount: string }[] = [];
    const walk = (list: Row[], depth: number) => {
      for (const r of list) {
        if (r.kind === 'element') {
          const e = r.element;
          out.push({ level: e.level === 'COMPONENT' ? 'Component' : 'Sub-component', code: e.code, name: e.name, kind: WORK_ELEMENT_TYPE_LABELS[e.elementType], weight: e.weightPct ?? '', effective: e.effectiveWeightPct, unit: '', planned: '', done: '', pct: e.progressPct, amount: e.boqAmount });
        } else if (r.kind === 'activity') {
          const a = r.activity;
          out.push({ level: a.parentActivityId ? 'Sub-activity' : 'Activity', code: '', name: `${'  '.repeat(depth)}${a.name}`, kind: '', weight: a.weightPct ?? '', effective: a.effectiveWeightPct, unit: a.unit, planned: a.isSummary ? '' : a.plannedQty, done: a.isSummary ? '' : a.executedQty, pct: a.progressPct, amount: '' });
        }
        if (r.children) walk(r.children, depth + 1);
      }
    };
    walk(rows, 0);
    return out;
  };

  const weightWarning =
    data.componentWeightTotal !== null ? `Component weights add up to ${data.componentWeightTotal}%, not 100%. Progress is worked out on their shares of ${data.componentWeightTotal}%.` : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Space size={24} wrap>
          <Statistic title="Physical progress" value={data.progressPct} suffix="%" styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          <Statistic title="Components" value={data.elements.filter((e) => e.level === 'COMPONENT').length} styles={{ content: { fontSize: themeFontSize('fontSizeXL') } }} />
          <div>
            <div className="text-muted">Contract</div>
            <AppTag style={{ marginTop: 6 }}>{CONTRACT_MODEL_LABELS[data.contractModel]}</AppTag>
          </div>
        </Space>
        <Space wrap>
          <ExportButton
            onExport={async () => {
              const r = exportRows();
              await downloadXlsx(exportFileName(`structure-${project.code}`), 'Structure', [
                { header: 'Level', value: (x: (typeof r)[number]) => x.level },
                { header: 'Number', value: (x) => x.code },
                { header: 'Name', value: (x) => x.name, width: 40 },
                { header: 'Kind', value: (x) => x.kind, width: 22 },
                { header: 'Weight %', value: (x) => (x.weight === '' ? '' : Number(x.weight)) },
                { header: 'Weight used %', value: (x) => x.effective },
                { header: 'Unit', value: (x) => x.unit },
                { header: 'Planned qty', value: (x) => (x.planned === '' ? '' : toNumber(x.planned)) },
                { header: 'Done qty', value: (x) => (x.done === '' ? '' : toNumber(x.done)) },
                { header: 'Progress %', value: (x) => x.pct },
                { header: 'BOQ amount', value: (x) => (x.amount === '' ? '' : toNumber(x.amount)) },
              ], r);
              return r.length;
            }}
          />
          {editor ? (
            <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>
              Import from Excel
            </Button>
          ) : null}
          {editor ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ element: null, parentId: null })}>
              New component
            </Button>
          ) : null}
        </Space>
      </Flex>
      {weightWarning ? <Alert type="warning" showIcon title={weightWarning} /> : null}
      <Table<Row>
        rowKey="key"
        size="middle"
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 860 }}
        expandable={{ expandedRowKeys: expanded, onExpandedRowsChange: (keys) => setExpanded([...keys]), indentSize: 20 }}
        locale={{
          emptyText: (
            <div style={{ padding: 24 }}>
              <p>
                No breakdown yet. Split the project into its components (an intake well, the treatment plant, each tank, each pipe zone) and progress rolls up
                from the activities under each, by weight.
              </p>
              {editor ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ element: null, parentId: null })}>
                  New component
                </Button>
              ) : null}
            </div>
          ),
        }}
      />
      {editor ? (
        <ElementFormDrawer
          open={!!form}
          onClose={() => setForm(null)}
          projectId={project.id}
          typeCode={project.typeCode}
          structure={data}
          element={form?.element ?? null}
          parentId={form?.parentId ?? null}
        />
      ) : null}
      {editor ? <StructureImportModal open={importOpen} onClose={() => setImportOpen(false)} projectId={project.id} /> : null}
    </div>
  );
}
