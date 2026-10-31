'use client';

import React from 'react';
import { Alert, App, Card, Flex, Switch, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { MODULE_KEYS, MODULE_LABELS, MODULE_TIER_LABELS, SWITCHABLE_MODULE_INFO, canManageModules, type ModuleSwitchDto, type ModuleSwitchesDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { useModuleSwitches, useSetModuleSwitch } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { NoAccess } from '@/components/common/NoAccess';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

/** One module: its switch, what it is, and why it cannot be turned on when the plan leaves it out. */
function ModuleRow({ m, busy, onChange }: { m: ModuleSwitchDto; busy: boolean; onChange: (on: boolean) => void }) {
  const { token } = theme.useToken();
  const id = `module-${m.key}`;
  return (
    <Flex gap={token.margin} align="flex-start" style={{ minHeight: 44, paddingBlock: token.paddingXS }}>
      <Switch id={id} checked={m.on} disabled={!m.inPlan} loading={busy} onChange={onChange} aria-describedby={`${id}-help`} />
      <div style={{ minWidth: 0 }}>
        <Flex gap={token.marginXS} align="center" wrap>
          <label htmlFor={id} style={{ fontWeight: 600 }}>
            {m.label}
          </label>
          {!m.inPlan && <AppTag>Not in your plan</AppTag>}
        </Flex>
        <Typography.Paragraph id={`${id}-help`} type="secondary" style={{ margin: 0 }}>
          {m.description}
        </Typography.Paragraph>
      </div>
    </Flex>
  );
}

function Modules({ data }: { data: ModuleSwitchesDto }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { refresh } = useAuth();
  const set = useSetModuleSwitch();
  const notify = useNotify();
  const change = (m: ModuleSwitchDto, on: boolean) =>
    set.mutate(
      { key: m.key, on },
      {
        // The signed-in user carries the modules that are off, so the sidebar, New and Search follow at once.
        onSuccess: async () => {
          await refresh();
          message.success(on ? `${m.label} is on` : `${m.label} is off; its records are kept`);
        },
        onError: (e) => notify.failed(e, () => change(m, on)),
      },
    );
  const sections = MODULE_KEYS.map((s) => ({ key: s, modules: data.modules.filter((m) => SWITCHABLE_MODULE_INFO[m.key].section === s) })).filter((s) => s.modules.length);
  return (
    <Flex vertical gap={token.margin}>
      {data.tier && (
        <Alert
          type="info"
          showIcon
          title={`Your plan is ${MODULE_TIER_LABELS[data.tier]}`}
          description="Modules outside it stay off. To have one, ask us to move you to a plan that has it."
        />
      )}
      {sections.map((s) => (
        <Card key={s.key} title={MODULE_LABELS[s.key]} size="small">
          <Flex vertical>
            {s.modules.map((m) => (
              <ModuleRow key={m.key} m={m} busy={set.isPending && set.variables?.key === m.key} onChange={(on) => change(m, on)} />
            ))}
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}

/**
 * Modules (v6 item 117): an admin turns off the parts of the product the company does not use. A module that is off leaves
 * the sidebar, Search, the New menu and Ask, and its pages and API say it is off; nothing is deleted.
 */
export default function CompanyModulesPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageModules(user.roleKey);
  const { data, isLoading, error, refetch } = useModuleSwitches(allowed);
  if (!user) return null;
  return (
    <div className="page-container" style={{ maxWidth: 948, marginLeft: 0 }}>
      <PageHeader title="Modules" subtitle="Turn off what your company does not use. It leaves the sidebar, Search, New and Ask for everyone; its records are kept." />
      {!allowed ? (
        <NoAccess title="Only an admin can turn modules on and off" />
      ) : isLoading ? (
        <PageSkeleton shape="record" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <Modules data={data} />
      ) : null}
    </div>
  );
}
