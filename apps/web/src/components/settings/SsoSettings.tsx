'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Flex, Form, Input, Popconfirm, Select, Switch, Typography } from 'antd';
import {
  ROLE_LABELS,
  SSO_NEW_PERSON_ROLES,
  SSO_PROVIDERS,
  SSO_PROVIDER_INFO,
  normaliseDomain,
  type SsoProvider,
  type SsoSettingsDto,
  type SsoSettingsInput,
} from '@erp/shared';
import { tk } from '@/ds';
import { useRemoveSsoSettings, useSaveSsoSettings, useSsoSettings } from '@/lib/queries';
import { useNotify } from '@/lib/notify';
import { formatDateTime, NO_VALUE } from '@/lib/format';
import { Section, SectionStack } from '@/components/common/Section';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { EditOutlined } from '@/components/common/icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';

type SsoForm = SsoSettingsInput;

const PHONE_NOTE = 'The phone app signs in with passwords for now, so requiring single sign-on stops its sign-in for these people too.';

function SsoDialog({ open, data, onClose }: { open: boolean; data: SsoSettingsDto; onClose: () => void }) {
  const [form] = Form.useForm<SsoForm>();
  const notify = useNotify();
  const save = useSaveSsoSettings();
  const s = data.settings;
  const provider = Form.useWatch('provider', form) as SsoProvider | undefined;
  const addNewPeople = Form.useWatch('addNewPeople', form) as boolean | undefined;
  const title = s ? 'Change single sign-on' : 'Set up single sign-on';
  useEffect(() => {
    if (open)
      form.setFieldsValue(
        s
          ? { provider: s.provider, tenantId: s.tenantId, clientId: s.clientId, clientSecret: '', allowedDomains: s.allowedDomains, enforce: s.enforce, addNewPeople: s.addNewPeople, newPersonRole: s.newPersonRole }
          : { provider: 'ENTRA', tenantId: '', clientId: '', clientSecret: '', allowedDomains: [], enforce: false, addNewPeople: false, newPersonRole: 'SITE_ENGINEER' },
      );
  }, [open, s, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title={title}
      okText="Save"
      onSubmit={async (v) => {
        await save.mutateAsync({ ...v, clientSecret: v.clientSecret?.trim() || null, tenantId: v.provider === 'ENTRA' ? v.tenantId : null });
        notify.success(v.enforce ? 'Single sign-on saved and required' : 'Single sign-on saved');
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="provider" label="Provider" rules={[{ required: true, message: 'Choose Microsoft Entra ID or Google Workspace' }]}>
          <Select options={SSO_PROVIDERS.map((p) => ({ value: p, label: SSO_PROVIDER_INFO[p].name }))} />
        </Form.Item>
        {provider === 'ENTRA' && (
          <Form.Item name="tenantId" label="Directory (tenant) ID" tooltip="On the app registration's Overview in Microsoft Entra" rules={[{ required: true, message: 'Enter the directory (tenant) ID' }]}>
            <Input spellCheck={false} autoComplete="off" translate="no" placeholder="00000000-0000-0000-0000-000000000000" />
          </Form.Item>
        )}
        <FormGrid cols={2}>
          <Form.Item name="clientId" label="Client ID" rules={[{ required: true, message: 'Enter the client ID the provider gave the app' }]}>
            <Input spellCheck={false} autoComplete="off" translate="no" />
          </Form.Item>
          <Form.Item
            name="clientSecret"
            label="Client secret"
            tooltip={s ? `Saved, ending ${s.secretLast4}. Leave it blank to keep it.` : 'Kept sealed on the server and never shown again'}
            rules={s ? [] : [{ required: true, message: 'Enter the client secret' }]}
          >
            <Input.Password autoComplete="new-password" placeholder={s ? 'Leave blank to keep the saved one' : undefined} />
          </Form.Item>
        </FormGrid>
        <Form.Item
          name="allowedDomains"
          label="Email domains"
          tooltip="People whose work email ends in one of these sign in this way. Type a domain and press Enter."
          rules={[
            { required: true, type: 'array', min: 1, message: 'Add at least one email domain, such as company.com' },
            { validator: async (_, v: string[] = []) => { const bad = v.find((d) => !normaliseDomain(d)); if (bad) throw new Error(`"${bad}" is not a domain. Enter it as company.com`); } },
          ]}
          normalize={(v: string[]) => v.map((d) => normaliseDomain(d) ?? d)}
        >
          <Select mode="tags" tokenSeparators={[',', ' ']} open={false} suffixIcon={null} placeholder="company.com" aria-label="Email domains" />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="addNewPeople" label="Add new people" valuePropName="checked" tooltip="Someone from these domains with no sign-in yet gets a place at their first sign-in. Off: an admin adds each person first.">
            <Switch />
          </Form.Item>
          {addNewPeople && (
            <Form.Item name="newPersonRole" label="Their role" rules={[{ required: true, message: 'Choose the role new people get' }]}>
              <Select options={SSO_NEW_PERSON_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} showSearch={{ optionFilterProp: 'label' }} />
            </Form.Item>
          )}
        </FormGrid>
        <Form.Item
          name="enforce"
          label="Require single sign-on"
          valuePropName="checked"
          tooltip={`Passwords stop working for the company's people; platform admins and supplier logins keep theirs. ${PHONE_NOTE}`}
          extra={data.signedInWithSso || s?.enforce ? undefined : 'Use single sign-on once before you require it.'}
        >
          <Switch disabled={!data.signedInWithSso && !s?.enforce} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Company settings › Sign-in (ARCHITECTURE "Single sign-on"): the provider, its domains and whether it is required. */
export function SsoSettingsTab() {
  const { data, isLoading, error, refetch } = useSsoSettings();
  const remove = useRemoveSsoSettings();
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const s = data.settings;
  return (
    <SectionStack>
      <Section
        title="Single sign-on"
        help="People sign in with their Microsoft or Google work account instead of a password. Choose Use single sign-on on the sign-in page and enter the company code."
        extra={
          s ? (
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)} disabled={!!data.serverProblem}>
              Change single sign-on
            </Button>
          ) : (
            <Button type="primary" onClick={() => setEditing(true)} disabled={!!data.serverProblem}>
              Set up single sign-on
            </Button>
          )
        }
      >
        {data.serverProblem && <Alert type="warning" showIcon title={data.serverProblem} style={{ marginBottom: tk.space[4] }} />}
        {s ? (
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2 }}
            items={[
              { key: 'provider', label: 'Provider', children: SSO_PROVIDER_INFO[s.provider].name },
              ...(s.tenantId ? [{ key: 'tenant', label: 'Directory (tenant) ID', children: <span className="mono" translate="no">{s.tenantId}</span> }] : []),
              { key: 'client', label: 'Client ID', children: <span className="mono" translate="no">{s.clientId}</span> },
              { key: 'secret', label: 'Client secret', children: <span translate="no">Saved, ending {s.secretLast4}</span> },
              { key: 'domains', label: 'Email domains', children: <span translate="no">{s.allowedDomains.join(', ')}</span> },
              { key: 'enforce', label: 'Require single sign-on', children: s.enforce ? 'Yes, passwords are refused' : 'No, passwords still work' },
              { key: 'new', label: 'New people', children: s.addNewPeople && s.newPersonRole ? `Added as ${ROLE_LABELS[s.newPersonRole]}` : 'Added by an admin' },
              { key: 'linked', label: 'People linked', children: <span translate="no">{s.linked}</span> },
              { key: 'updated', label: 'Last changed', children: formatDateTime(s.updatedAt) },
            ]}
          />
        ) : (
          <p style={{ margin: 0, color: tk.color.text.muted }}>People sign in with their email and password.</p>
        )}
      </Section>
      <Section title="Register the app" help="In Microsoft Entra (App registrations) or Google Cloud (OAuth client, Web application), add this redirect URI, then copy the client ID and a client secret here.">
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: 'callback', label: 'Redirect URI', children: data.callbackUrl ? <Typography.Text copyable className="mono" translate="no">{data.callbackUrl}</Typography.Text> : NO_VALUE },
            { key: 'code', label: 'Company code', children: <Typography.Text copyable className="mono" translate="no">{data.companyCode}</Typography.Text> },
          ]}
        />
      </Section>
      {s && (
        <Section title="Stop single sign-on">
          <Flex align="center" justify="space-between" gap={tk.space[3]} wrap>
            <span style={{ color: tk.color.text.muted }}>Everyone signs in with their email and password again. Links to accounts are kept.</span>
            <Popconfirm
              title="Stop single sign-on?"
              description="People who never set a password use Forgot password on the sign-in page."
              okText="Stop single sign-on"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                try {
                  await remove.mutateAsync();
                  notify.success('Single sign-on stopped');
                } catch (e) {
                  notify.failed(e);
                }
              }}
            >
              <Button danger loading={remove.isPending}>
                Stop single sign-on
              </Button>
            </Popconfirm>
          </Flex>
        </Section>
      )}
      <SsoDialog open={editing} data={data} onClose={() => setEditing(false)} />
    </SectionStack>
  );
}
