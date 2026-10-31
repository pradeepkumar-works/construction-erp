'use client';

import React, { useState } from 'react';
import { App, Button, Drawer, Flex, Switch, Table, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { canApproveSupplierChange, type PasswordLinkDto, type SupplierChangeDto, type SupplierLoginDto } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useSupplierAction, useVendorPortal } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDate, NO_VALUE } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { PasswordLinkModal } from '@/components/users/PasswordLinkModal';
import { ChangeList } from './ChangeList';
import { DecideChangeForm, InviteLoginForm } from './StaffForms';

/** A vendor's supplier-portal logins and the changes they asked for (v6 item 105), from the vendor master. */
export function VendorPortalDrawer({ vendor, onClose }: { vendor: { id: string; name: string } | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useVendorPortal(vendor?.id ?? null);
  const act = useSupplierAction<SupplierLoginDto | PasswordLinkDto>();
  const [inviting, setInviting] = useState(false);
  const [shown, setShown] = useState<{ name: string; email: string; invite: boolean; link: PasswordLinkDto } | null>(null);
  const [deciding, setDeciding] = useState<{ change: SupplierChangeDto; approve: boolean } | null>(null);
  const toggle = async (l: SupplierLoginDto, isActive: boolean) => {
    try {
      await act.mutateAsync({ method: 'patch', path: `/supplier-portal/vendors/${vendor?.id}/logins/${l.id}`, body: { isActive } });
      message.success(isActive ? `${l.fullName} can sign in again` : `${l.fullName} can no longer sign in`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const newLink = async (l: SupplierLoginDto) => {
    try {
      const link = (await act.mutateAsync({ path: `/supplier-portal/vendors/${vendor?.id}/logins/${l.id}/link` })) as PasswordLinkDto;
      setShown({ name: l.fullName, email: l.email, invite: l.invitePending, link });
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  return (
    <Drawer
      open={!!vendor}
      onClose={onClose}
      size={820}
      title={vendor ? `Supplier portal: ${vendor.name}` : 'Supplier portal'}
      extra={
        <Button type="primary" onClick={() => setInviting(true)}>
          New login
        </Button>
      }
    >
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      <Typography.Paragraph type="secondary">
        A login sees this vendor&apos;s enquiries, orders, invoices and payments, and can send dispatch notes and invoices. Changes to their details come here for approval.
      </Typography.Paragraph>
      <Section title="Logins">
        <Table<SupplierLoginDto>
          rowKey="id"
          size="small"
          loading={isLoading}
          dataSource={data?.logins ?? []}
          pagination={false}
          locale={{ emptyText: 'No logins yet. Give one with New login.' }}
          scroll={{ x: 680 }}
          columns={[
            { title: 'Name', dataIndex: 'fullName', render: (v: string, l) => <span translate="no">{v}<br /><Typography.Text type="secondary">{l.email}</Typography.Text></span> },
            { title: 'Phone', dataIndex: 'phone', width: 140, render: (v: string | null) => <span translate="no">{v ?? NO_VALUE}</span> },
            { title: 'Since', dataIndex: 'createdAt', width: 110, render: (v: string) => formatDate(v) },
            { title: 'Status', key: 'state', width: 130, render: (_, l) => (!l.isActive ? <AppTag>Off</AppTag> : l.invitePending ? <AppTag tone="pending">Invite not used</AppTag> : <AppTag tone="success">Signed up</AppTag>) },
            {
              title: 'Action',
              key: 'action',
              width: 190,
              render: (_, l) => (
                <Flex gap={8} align="center">
                  <Switch checked={l.isActive} onChange={(on) => toggle(l, on)} aria-label={`${l.fullName} can sign in`} />
                  {l.isActive ? (
                    <Button size="small" onClick={() => newLink(l)} aria-label={`New link for ${l.fullName}`}>
                      New link
                    </Button>
                  ) : null}
                </Flex>
              ),
            },
          ]}
        />
      </Section>
      <div style={{ height: token.marginLG }} />
      <Section title="Changes to their details">
        <ChangeList
          changes={data?.changes ?? []}
          extra={(c) =>
            c.status === 'PENDING' && user && canApproveSupplierChange(user.roleKey, c.bank) ? (
              <Flex gap={8} wrap>
                <Button size="small" type="primary" onClick={() => setDeciding({ change: c, approve: true })}>
                  Approve
                </Button>
                <Button size="small" onClick={() => setDeciding({ change: c, approve: false })}>
                  Reject
                </Button>
              </Flex>
            ) : c.status === 'PENDING' && c.bank ? (
              <Typography.Text type="secondary">Accounts approve bank changes</Typography.Text>
            ) : null
          }
        />
      </Section>
      <InviteLoginForm
        vendor={inviting ? vendor : null}
        onClose={() => setInviting(false)}
        onInvited={(r) => setShown({ name: r.login.fullName, email: r.login.email, invite: true, link: r.invite })}
      />
      <DecideChangeForm decision={deciding} onClose={() => setDeciding(null)} />
      <PasswordLinkModal result={shown} onClose={() => setShown(null)} />
    </Drawer>
  );
}
