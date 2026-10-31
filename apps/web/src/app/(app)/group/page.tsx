'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Result, Switch, Typography, theme } from 'antd';
import { COMPANY_KIND_LABELS, canSeeGroupCompanies, type GroupCompanyDto, type GroupDto, type GroupPersonDto } from '@erp/shared';
import { EditOutlined, PlusOutlined, UserAddOutlined } from '@/components/common/icons';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ResultMark } from '@/components/common/ResultMark';
import { DataTable, useColumnChoice, type ListColumn } from '@/components/list/DataTable';
import { FormShell } from '@/components/form/FormShell';
import { CompanyForm } from '@/components/group/CompanyForm';
import { PlaceForm } from '@/components/group/PlaceForm';
import { useAuth } from '@/lib/auth';
import { useGroup, useMakeGroup, useSetGroupAdmin } from '@/lib/queries';

function Sub({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return <div style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>{children}</div>;
}

const code = (v: string | null) => (v ? <span translate="no">{v}</span> : <span className="text-muted">-</span>);

function CompaniesTab({ group, onEdit }: { group: GroupDto; onEdit: (c: GroupCompanyDto) => void }) {
  const columns = useMemo<ListColumn<GroupCompanyDto>[]>(
    () => [
      {
        key: 'name',
        title: 'Company',
        locked: true,
        card: 'title',
        cardText: (c) => (c.current ? `${c.name} (you are here)` : c.name),
        render: (_, c) => (
          <div>
            <strong translate="no">{c.name}</strong>
            {c.current && (
              <AppTag tone="info" style={{ marginLeft: 8 }}>
                You are here
              </AppTag>
            )}
            {c.legalName && c.legalName !== c.name && (
              <Sub>
                <span translate="no">{c.legalName}</span>
              </Sub>
            )}
          </div>
        ),
      },
      { key: 'kind', title: 'Kind', width: 150, card: 'status', render: (_, c) => <AppTag style={{ margin: 0 }}>{COMPANY_KIND_LABELS[c.kind]}</AppTag> },
      { key: 'gstin', title: 'GSTIN', width: 180, render: (_, c) => code(c.gstin) },
      { key: 'pan', title: 'PAN', width: 130, defaultFrom: 1280, render: (_, c) => code(c.pan) },
      { key: 'cin', title: 'CIN', width: 220, defaultHidden: true, render: (_, c) => code(c.cin) },
      { key: 'people', title: 'People', width: 90, align: 'right', render: (_, c) => <span translate="no">{c.people}</span> },
      { key: 'yourRole', title: 'Your role', width: 170, card: 'meta', cardText: (c) => (c.yourRole ? `You: ${c.yourRole}` : 'You have no place here'), render: (_, c) => c.yourRole ?? <span className="text-muted">No place</span> },
      {
        key: 'actions',
        title: '',
        label: 'Actions',
        locked: true,
        width: 90,
        fixed: 'right',
        card: false,
        render: (_, c) => (
          <Button size="small" icon={<EditOutlined />} aria-label={`Edit ${c.name}`} onClick={() => onEdit(c)}>
            Edit
          </Button>
        ),
      },
    ],
    [onEdit],
  );
  const choice = useColumnChoice('group-companies', columns);
  return (
    <DataTable<GroupCompanyDto>
      columns={columns}
      visible={choice.visible}
      onChooseColumns={choice.setChosen}
      chosenIsDefault={choice.isDefault}
      rows={group.companies}
      table={{ pagination: false }}
      onOpen={(id) => {
        const c = group.companies.find((x) => x.id === id);
        if (c) onEdit(c);
      }}
      scrollX={900}
      emptyText={<EmptyArt art="entries" size="small" title="No companies yet" />}
    />
  );
}

type PersonRow = GroupPersonDto & { id: string };

function PeopleTab({ group, myEmail, onGive }: { group: GroupDto; myEmail: string; onGive: (p: GroupPersonDto) => void }) {
  const setAdmin = useSetGroupAdmin();
  const { message } = App.useApp();
  const rows = useMemo<PersonRow[]>(() => group.people.map((p) => ({ ...p, id: p.loginId })), [group.people]);
  const admins = group.people.filter((p) => p.admin).length;
  const columns = useMemo<ListColumn<PersonRow>[]>(
    () => [
      {
        key: 'name',
        title: 'Name',
        locked: true,
        card: 'title',
        cardText: (p) => p.fullName,
        render: (_, p) => (
          <div>
            <strong translate="no">{p.fullName}</strong>
            <Sub>
              <span translate="no">{p.email}</span>
            </Sub>
          </div>
        ),
      },
      {
        key: 'places',
        title: 'Works in',
        card: 'meta',
        cardText: (p) => p.places.map((pl) => `${pl.companyName} · ${pl.roleName}${pl.isActive ? '' : ' (off)'}`).join(', '),
        render: (_, p) => (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {p.places.map((pl) => (
              <AppTag key={pl.organizationId} tone={pl.isActive ? 'neutral' : 'pending'} style={{ margin: 0 }}>
                <span translate="no">{pl.companyName}</span> · {pl.roleName}
                {pl.isActive ? '' : ' (off)'}
              </AppTag>
            ))}
          </span>
        ),
      },
      {
        key: 'admin',
        title: 'Group admin',
        width: 130,
        render: (_, p) => (
          <Switch
            size="small"
            checked={p.admin}
            // The group keeps at least one admin, and you cannot take your own away.
            disabled={(p.admin && admins <= 1) || p.email === myEmail}
            loading={setAdmin.isPending && setAdmin.variables?.loginId === p.loginId}
            aria-label={`${p.fullName} is a group admin`}
            onChange={(admin) =>
              setAdmin.mutate({ loginId: p.loginId, admin }, { onSuccess: () => message.success(admin ? `${p.fullName} is now a group admin` : `${p.fullName} is no longer a group admin`) })
            }
          />
        ),
      },
      {
        key: 'actions',
        title: '',
        label: 'Actions',
        locked: true,
        width: 150,
        fixed: 'right',
        card: false,
        render: (_, p) => (
          <Button size="small" icon={<UserAddOutlined />} aria-label={`Give ${p.fullName} a place`} disabled={p.places.filter((x) => x.isActive).length >= group.companies.length} onClick={() => onGive(p)}>
            Give a place
          </Button>
        ),
      },
    ],
    [admins, myEmail, setAdmin, message, onGive, group.companies.length],
  );
  const choice = useColumnChoice('group-people', columns);
  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        Everyone with a place in a company of the group. A place in another company uses the same sign-in. New people are added from Users in their own company.
      </Typography.Paragraph>
      <DataTable<PersonRow>
        columns={columns}
        visible={choice.visible}
        onChooseColumns={choice.setChosen}
        chosenIsDefault={choice.isDefault}
        rows={rows}
        // A row gives that person a place in another company (the button on a wide screen, the card on a phone).
        onOpen={(id) => {
          const p = group.people.find((x) => x.loginId === id);
          if (p && p.places.filter((x) => x.isActive).length < group.companies.length) onGive(p);
        }}
        table={{ pagination: rows.length > 50 ? { pageSize: 50, showSizeChanger: false } : false }}
        scrollX={900}
        emptyText={<EmptyArt art="entries" size="small" title="No people yet" />}
      />
    </>
  );
}

/** A company admin's first step: name the group, with this company as its first. */
function MakeGroup({ companyName }: { companyName: string }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const make = useMakeGroup();
  return (
    <Card size="small">
      <Result
        icon={<ResultMark />}
        title="Make a group to run more than one company"
        subTitle={`A group holds your companies, such as a construction company, a consultancy and a quality lab. Each keeps its own projects, people, books and menu; you sign in once and switch between them. ${companyName} becomes its first company.`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Make a group
          </Button>
        }
      />
      <FormShell
        open={open}
        onClose={() => setOpen(false)}
        form={form}
        layout="modal"
        width={440}
        title="Make a group"
        okText="Make group"
        projectDefault={false}
        onSubmit={async (v) => {
          await make.mutateAsync(v.name.trim());
          await refresh();
          message.success(`${v.name.trim()} is made. Add its other companies with New company.`);
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Group name" rules={[{ required: true, whitespace: true, message: 'Enter the name of the group' }, { min: 2, message: 'At least 2 characters' }]} extra="Usually the parent company's name, like Sai Ram Group">
            <Input maxLength={120} />
          </Form.Item>
        </Form>
      </FormShell>
    </Card>
  );
}

/**
 * Group companies (ARCHITECTURE "Group companies"): the group's admins see its companies with their kind and legal
 * details, add a company, and give people of the group a place in another company on the sign-in they already have.
 */
export default function GroupPage() {
  const { user } = useAuth();
  const allowed = !!user && canSeeGroupCompanies(user);
  const { data, isLoading, error, refetch } = useGroup(allowed);
  const [editing, setEditing] = useState<GroupCompanyDto | 'new' | null>(null);
  const [giving, setGiving] = useState<GroupPersonDto | null>(null);
  const onEdit = React.useCallback((c: GroupCompanyDto) => setEditing(c), []);
  const onGive = React.useCallback((p: GroupPersonDto) => setGiving(p), []);
  if (!user) return null;
  const group = data?.group ?? null;
  const newButton = group ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
      New company
    </Button>
  ) : null;

  return (
    <div className="page-container">
      <PageHeader
        title="Group companies"
        subtitle={group ? <span translate="no">{group.name}</span> : 'Run a parent company and its child companies from one sign-in.'}
        extra={newButton}
      />
      {!allowed ? (
        <Result icon={<ResultMark kind="no-access" />} title="Group admins only" subTitle="Ask a group admin to give you a place in another company, or to make you an admin." />
      ) : isLoading ? (
        <PageSkeleton shape="list" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : group ? (
        <Card size="small">
          <AppTabs
            variant="page"
            items={[
              { key: 'companies', label: 'Companies', count: group.companies.length, countLabel: 'companies', children: <CompaniesTab group={group} onEdit={onEdit} /> },
              { key: 'people', label: 'People', count: group.people.length, countLabel: 'people', children: <PeopleTab group={group} myEmail={user.email} onGive={onGive} /> },
            ]}
          />
        </Card>
      ) : data?.canMakeGroup ? (
        <MakeGroup companyName={user.organizationName} />
      ) : null}
      <CompanyForm open={editing !== null} company={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <PlaceForm person={giving} companies={group?.companies ?? []} onClose={() => setGiving(null)} />
    </div>
  );
}
