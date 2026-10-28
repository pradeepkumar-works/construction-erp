'use client';

import React, { useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Flex, Input, Table, Typography, theme } from 'antd';
import type { NavLayout, NavLook, NavModuleSet, NavSettingsDto } from '@erp/shared';
import { DEFAULT_NAV_SETTINGS, NAV_LAYOUT_LABELS, NAV_LOOK_LABELS, NAV_MODULE_SET_LABELS, NAV_NAME_MAX, canManageModules, navModuleDefs, type NavModuleDef } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { useNavSettings, useSaveNavSettings } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ChoiceCards, MenuPicture, type Choice } from '@/components/menu/ChoiceCards';
import { TreeIcon } from '@/components/shell/nav-icons';

const LAYOUTS: Choice<NavLayout>[] = [
  { value: 'TOP_BAR', label: NAV_LAYOUT_LABELS.TOP_BAR, description: 'Home holds the modules as tiles; a module opens with its sub-modules in a bar across the top.', picture: <MenuPicture kind="NAVY" /> },
  { value: 'SIDEBAR', label: NAV_LAYOUT_LABELS.SIDEBAR, description: 'Every module and page in a menu down the left, folded to icons when you need the room.', picture: <MenuPicture kind="SIDEBAR" /> },
];

const LOOKS: Choice<NavLook>[] = [
  { value: 'NAVY', label: NAV_LOOK_LABELS.NAVY, description: 'A navy bar with the module’s menu in a white bar under it. The most familiar.', picture: <MenuPicture kind="NAVY" /> },
  { value: 'FRAME', label: NAV_LOOK_LABELS.FRAME, description: 'A light frame round the page; Home lists each module with its sub-modules.', picture: <MenuPicture kind="FRAME" /> },
  { value: 'BAR', label: NAV_LOOK_LABELS.BAR, description: 'One white bar holding the module and its menu; Home groups the modules in three.', picture: <MenuPicture kind="BAR" /> },
];

const SETS: Choice<NavModuleSet>[] = [
  { value: 'DEPARTMENTS', label: NAV_MODULE_SET_LABELS.DEPARTMENTS, description: 'Twelve modules as a contractor’s departments run: project management, purchase, stores, contractors, machinery and so on.' },
  { value: 'AREAS', label: NAV_MODULE_SET_LABELS.AREAS, description: 'The modules as Nirmaan has them: site, materials, purchases, subcontracts, client billing and so on.' },
];

const sameNames = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
const same = (a: NavSettingsDto, b: NavSettingsDto) =>
  a.layout === b.layout && a.look === b.look && a.moduleSet === b.moduleSet && a.personalLook === b.personalLook && sameNames(a.names, b.names);

/** Drops empty names and names the same as the module's own, as the server keeps them. */
function tidy(v: NavSettingsDto): NavSettingsDto {
  const own = new Map([...navModuleDefs('AREAS'), ...navModuleDefs('DEPARTMENTS')].map((m) => [m.key, m.label]));
  const names = Object.fromEntries(
    Object.entries(v.names)
      .map(([k, n]) => [k, n.replace(/\s+/g, ' ').trim()] as const)
      .filter(([k, n]) => n && n !== own.get(k)),
  );
  return { ...v, names };
}

function MenuForm({ saved }: { saved: NavSettingsDto }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { refresh } = useAuth();
  const notify = useNotify();
  const save = useSaveNavSettings();
  const [v, setV] = useState<NavSettingsDto>(saved);
  const changed = !same(tidy(v), tidy(saved));
  const set = <K extends keyof NavSettingsDto>(k: K, value: NavSettingsDto[K]) => setV((x) => ({ ...x, [k]: value }));
  const modules = useMemo(() => navModuleDefs(v.moduleSet), [v.moduleSet]);
  const long = Object.values(v.names).some((n) => n.trim().length > NAV_NAME_MAX);

  const submit = () =>
    save.mutate(tidy(v), {
      // The signed-in user carries the menu, so the shell follows at once; everyone else gets it on their next page.
      onSuccess: async () => {
        await refresh();
        message.success('Menu saved. Everyone gets it on their next page.');
      },
      onError: (e) => notify.failed(e, submit),
    });

  const columns = [
    {
      key: 'module',
      title: 'Module',
      render: (_: unknown, m: NavModuleDef) => (
        <Flex align="center" gap={token.marginXS}>
          <TreeIcon name={m.icon} />
          <span>{m.label}</span>
        </Flex>
      ),
    },
    {
      key: 'name',
      title: 'Your company’s name',
      width: '40%',
      render: (_: unknown, m: NavModuleDef) => {
        const value = v.names[m.key] ?? '';
        const tooLong = value.trim().length > NAV_NAME_MAX;
        return (
          <Input
            value={value}
            placeholder={m.label}
            aria-label={`Your company’s name for ${m.label}`}
            status={tooLong ? 'error' : undefined}
            onChange={(e) => set('names', { ...v.names, [m.key]: e.target.value })}
            allowClear
          />
        );
      },
    },
    {
      key: 'subs',
      title: 'Its menu',
      responsive: ['md' as const],
      render: (_: unknown, m: NavModuleDef) => <Typography.Text type="secondary">{m.subs.map((s) => s.label).join(', ')}</Typography.Text>,
    },
  ];

  return (
    <Flex vertical gap={token.margin}>
      <Card size="small" title="Where the menu sits">
        <ChoiceCards label="Where the menu sits" value={v.layout} onChange={(x) => set('layout', x)} choices={LAYOUTS} />
      </Card>
      <Card size="small" title="Look of the top bar">
        <Flex vertical gap={token.marginSM}>
          {v.layout === 'SIDEBAR' && <Typography.Text type="secondary">Used when the menu is in the top bar.</Typography.Text>}
          <ChoiceCards label="Look of the top bar" value={v.look} onChange={(x) => set('look', x)} choices={LOOKS} />
          <Checkbox checked={v.personalLook} onChange={(e) => set('personalLook', e.target.checked)}>
            Let each person choose their own look, from their account menu
          </Checkbox>
        </Flex>
      </Card>
      <Card size="small" title="Modules and their names">
        <Flex vertical gap={token.marginSM}>
          <ChoiceCards label="How pages are grouped into modules" value={v.moduleSet} onChange={(x) => set('moduleSet', x)} choices={SETS} />
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Give a module the name your people use, up to {NAV_NAME_MAX} characters. Leave it empty to keep ours. Each person sees only the modules and pages their role opens.
          </Typography.Paragraph>
          <Table<NavModuleDef> rowKey="key" size="small" pagination={false} columns={columns} dataSource={modules} />
        </Flex>
      </Card>
      {long && <Alert type="error" showIcon title={`Shorten the names in red to ${NAV_NAME_MAX} characters or fewer.`} />}
      <Flex gap={token.marginSM} wrap>
        <Button type="primary" onClick={submit} disabled={!changed || long} loading={save.isPending}>
          Save menu
        </Button>
        <Button onClick={() => setV(saved)} disabled={!changed}>
          Undo changes
        </Button>
        <Button type="link" onClick={() => setV({ ...DEFAULT_NAV_SETTINGS, names: {} })} disabled={same(tidy(v), DEFAULT_NAV_SETTINGS)}>
          Back to Nirmaan’s menu
        </Button>
      </Flex>
    </Flex>
  );
}

/**
 * Menu and names: an admin chooses where the menu sits (the top bar with the modules on Home, or the sidebar), the top
 * bar's look, how pages are grouped into modules and what each module is called. ARCHITECTURE "Menu and names".
 */
export default function MenuAndNamesPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageModules(user.roleKey);
  const { data, isLoading, error, refetch } = useNavSettings(allowed);
  if (!user) return null;
  return (
    <div className="page-container" style={{ maxWidth: 1080, marginLeft: 0 }}>
      <PageHeader title="Menu and names" subtitle="Where the menu sits, how it looks and what each module is called, for everyone in your company." />
      {!allowed ? (
        <Alert type="info" title="Only an admin can change the menu." />
      ) : isLoading ? (
        <PageSkeleton shape="record" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <MenuForm saved={data} />
      ) : null}
    </div>
  );
}
