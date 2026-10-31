'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Flex, Form, Skeleton, Space, Typography, theme } from 'antd';
import {
  PROJECT_STATUS_LABELS,
  activityItemKey,
  componentItemKey,
  looseItemKey,
  planSize,
  withoutItems,
  type ProjectStatus,
  type ProjectUpdatePlan,
  type ProjectUpdateRowDto,
} from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { QueryError } from '@/components/common/QueryState';
import { FormShell } from '@/components/form/FormShell';
import { PROJECT_STATUS_COLORS } from '@/lib/format';
import { useApplyTypeUpdates, useTypeUpdates } from '@/lib/queries';

/** Per project: whether it is updated, and what of its plan is left out. */
type Choice = Record<string, { on: boolean; skip: string[] }>;

interface Values {
  choice: Choice;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sizeText = (p: ProjectUpdatePlan) => {
  const s = planSize(p);
  return [s.components ? plural(s.components, 'component') : null, s.activities ? plural(s.activities, 'activity', 'activities') : null].filter(Boolean).join(' and ') || 'nothing';
};
const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

interface Item {
  key: string;
  label: React.ReactNode;
}

/** What a plan adds, as the things the admin can leave out: new components (with their sub-components), new activities in components the project has, and loose activities. */
function itemsOf(plan: ProjectUpdatePlan): { title: string; items: Item[] }[] {
  const tops = plan.components.filter((c) => !c.parentKey);
  const components = tops.map((c) => {
    const subs = plan.components.filter((s) => s.parentKey === c.key);
    const acts = c.activities.length + subs.reduce((t, s) => t + s.activities.length, 0);
    return {
      key: componentItemKey(c),
      label: (
        <span>
          <strong>{c.name}</strong>
          {c.parentName ? ` in ${c.parentName}` : ''}
          <span className="text-muted">
            {' '}
            · {plural(acts, 'activity', 'activities')}
            {subs.length ? `, with ${subs.map((s) => s.name).join(', ')}` : ''}
          </span>
        </span>
      ),
    };
  });
  const activities = plan.activities
    .filter((a) => !a.parentKey)
    .map((a) => {
      const subs = plan.activities.filter((s) => s.elementId === a.elementId && s.parentKey === a.key).length;
      return {
        key: activityItemKey(a),
        label: (
          <span>
            {a.name}
            <span className="text-muted">
              {' '}
              in {a.elementName}
              {a.parentActivityId ? ', under an activity it has' : ''}
              {subs ? `, with ${plural(subs, 'sub-activity', 'sub-activities')}` : ''}
            </span>
          </span>
        ),
      };
    });
  const loose = plan.loose.map((n) => ({ key: looseItemKey(n), label: n }));
  return [
    { title: 'New components', items: components },
    { title: 'New activities in components it has', items: activities },
    { title: 'Activities outside the components', items: loose },
  ].filter((g) => g.items.length);
}

function ProjectChoice({ row, value, onChange, defaultOn }: { row: ProjectUpdateRowDto; value: { on: boolean; skip: string[] } | undefined; onChange: (v: { on: boolean; skip: string[] }) => void; defaultOn: boolean }) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const v = value ?? { on: defaultOn, skip: [] };
  const groups = useMemo(() => itemsOf(row.plan), [row.plan]);
  const chosen = withoutItems(row.plan, v.skip);
  const listId = `update-items-${row.projectId}`;
  return (
    <Card size="small" style={{ marginBottom: token.marginSM }}>
      <Flex justify="space-between" align="center" gap={token.marginXS} wrap>
        <Checkbox checked={v.on} onChange={(e) => onChange({ ...v, on: e.target.checked })}>
          <strong translate="no">{row.code}</strong> <span translate="no">{row.name}</span>
        </Checkbox>
        <Space size={token.marginXXS} wrap>
          <AppTag color={PROJECT_STATUS_COLORS[row.status as ProjectStatus]}>{PROJECT_STATUS_LABELS[row.status as ProjectStatus] ?? row.status}</AppTag>
          {row.typeVersion === null ? <AppTag tone="pending">Older than its type</AppTag> : <AppTag tone="neutral">Version {row.typeVersion}</AppTag>}
        </Space>
      </Flex>
      <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXXS}px 0 0` }}>
        Gets {sizeText(chosen)}
        {v.skip.length ? ` (of ${sizeText(row.plan)})` : ''}. Progress{' '}
        <span translate="no">{pct(row.progressNow)}</span>
        {Math.abs(row.progressAfter - row.progressNow) >= 0.05 ? (
          <>
            {' '}
            becomes <span translate="no">{pct(row.progressAfter)}</span> with everything in
          </>
        ) : (
          ' stays as it is'
        )}
        .
      </Typography.Paragraph>
      <Button type="link" style={{ paddingInline: 0 }} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide what it gets' : 'Choose what it gets'}
      </Button>
      {open ? (
        <div id={listId}>
          {groups.map((g) => (
            <div key={g.title} style={{ marginTop: token.marginXS }}>
              <Typography.Text strong>{g.title}</Typography.Text>
              <Checkbox.Group
                aria-label={`${g.title} for ${row.code}`}
                disabled={!v.on}
                style={{ display: 'grid', gap: token.marginXXS, marginTop: token.marginXXS }}
                value={g.items.map((i) => i.key).filter((k) => !v.skip.includes(k))}
                onChange={(checked) => {
                  const mine = g.items.map((i) => i.key);
                  const others = v.skip.filter((k) => !mine.includes(k));
                  onChange({ ...v, skip: [...others, ...mine.filter((k) => !(checked as string[]).includes(k))] });
                }}
                options={g.items.map((i) => ({ value: i.key, label: i.label }))}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Chooser({ rows, value, onChange, defaultOn }: { rows: ProjectUpdateRowDto[]; value?: Choice; onChange?: (v: Choice) => void; defaultOn: (r: ProjectUpdateRowDto) => boolean }) {
  const { token } = theme.useToken();
  const set = (next: Choice) => onChange?.(next);
  const all = (on: boolean) => set(Object.fromEntries(rows.map((r) => [r.projectId, { on, skip: value?.[r.projectId]?.skip ?? [] }])));
  return (
    <>
      <Space wrap style={{ marginBottom: token.marginSM }}>
        <Button size="small" onClick={() => all(true)}>
          Choose all
        </Button>
        <Button size="small" onClick={() => all(false)}>
          Choose none
        </Button>
      </Space>
      {rows.map((r) => (
        <ProjectChoice key={r.projectId} row={r} defaultOn={defaultOn(r)} value={value?.[r.projectId]} onChange={(c) => set({ ...(value ?? {}), [r.projectId]: c })} />
      ))}
    </>
  );
}

/**
 * Update projects (item 134 part 3, ARCHITECTURE "Project types", Updating projects): each running project of a type
 * (or each one with components of a kind) and what it would gain from the type as it is now, to add it all or in part.
 * It only adds; what a project has stays as it is.
 */
export function UpdateProjects({ what, code, name, open, onClose }: { what: 'type' | 'kind'; code: string; name: string; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const updates = useTypeUpdates(what, code, open);
  const apply = useApplyTypeUpdates(what, code);
  // A project made before types had no type to follow, so what it would get is worth a look before it is ticked.
  const defaultOn = (r: ProjectUpdateRowDto) => what === 'kind' || r.typeVersion !== null;
  const rows = useMemo(() => updates.data?.rows ?? [], [updates.data]);

  useEffect(() => {
    if (!open || !updates.data) return;
    form.resetFields();
    form.setFieldsValue({ choice: Object.fromEntries(rows.map((r) => [r.projectId, { on: defaultOn(r), skip: [] }])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per preview, not on every render of `defaultOn`
  }, [open, updates.data, form, rows]);

  const choice = (Form.useWatch('choice', form) as Choice | undefined) ?? {};
  const picked = rows.filter((r) => choice[r.projectId]?.on ?? defaultOn(r));
  const total = picked.reduce(
    (t, r) => {
      const s = planSize(withoutItems(r.plan, choice[r.projectId]?.skip ?? []));
      return { components: t.components + s.components, activities: t.activities + s.activities };
    },
    { components: 0, activities: 0 },
  );
  const adds = total.components + total.activities;

  return (
    <FormShell<Values>
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={760}
      title={what === 'type' ? `Update projects of ${name}` : `Update components made from ${name}`}
      okText={picked.length ? `Update ${plural(picked.length, 'project')}` : 'Update projects'}
      okDisabled={!picked.length || !adds}
      projectDefault={false}
      footerExtra={picked.length ? <span className="text-muted">Adds {[total.components ? plural(total.components, 'component') : null, total.activities ? plural(total.activities, 'activity', 'activities') : null].filter(Boolean).join(' and ') || 'nothing'}</span> : null}
      onSubmit={async (v) => {
        const projects = rows.filter((r) => v.choice?.[r.projectId]?.on ?? defaultOn(r)).map((r) => ({ projectId: r.projectId, skip: v.choice?.[r.projectId]?.skip ?? [] }));
        const res = await apply.mutateAsync(projects);
        message.success(
          res.projects
            ? `Added ${[res.components ? plural(res.components, 'component') : null, plural(res.activities, 'activity', 'activities')].filter(Boolean).join(' and ')} to ${plural(res.projects, 'project')}`
            : 'Nothing to add: those projects have it all already',
        );
      }}
    >
      <Form form={form} layout="vertical">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Only adds what a project lacks"
          description={
            what === 'type'
              ? `Each project gets the starting components of ${name} it has no copy of, the steps its components' types have gained, and the type's activities it has no activity of that name for. Nothing it has is changed or removed. New work comes in with no weight, so progress does not move until the planner weighs it.`
              : `Each component laid out from ${name} gets the steps it has no activity of that name for. Nothing it has is changed or removed, and a step kept as one line is not split. New activities come in with no weight, so progress does not move until the planner weighs them.`
          }
        />
        {updates.error ? (
          <QueryError error={updates.error} onRetry={() => updates.refetch()} />
        ) : !updates.data ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : !rows.length ? (
          <Typography.Paragraph>
            {updates.data.upToDate
              ? `${what === 'type' ? 'Every project of this type' : 'Every component of this type'} already has everything ${name} has now.`
              : what === 'type'
                ? 'No projects are of this type yet.'
                : 'No components were made from this type yet.'}
          </Typography.Paragraph>
        ) : (
          <>
            <Typography.Paragraph type="secondary">
              {plural(rows.length, 'project')} can gain something
              {updates.data.upToDate ? `; ${plural(updates.data.upToDate, 'other is', 'others are')} up to date` : ''}.
              {what === 'type' && rows.some((r) => r.typeVersion === null) ? ' A project made before project types is left unticked: check what it gets first.' : ''}
            </Typography.Paragraph>
            <Form.Item name="choice" noStyle>
              <Chooser rows={rows} defaultOn={defaultOn} />
            </Form.Item>
          </>
        )}
      </Form>
    </FormShell>
  );
}
