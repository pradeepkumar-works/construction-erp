'use client';

import React, { useEffect, useState } from 'react';
import { App, Button, Flex, Form, Input, Modal, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { ROLE_KEYS, isGuest, type ApprovalDelegationDto } from '@erp/shared';
import { tk } from '@/ds';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useApprovalDelegations, useCreateDelegation, useEndDelegation } from '@/lib/queries';
import { AppTag } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { UserSelect } from '@/components/common/SearchSelect';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { PlusOutlined } from '@/components/common/icons';

/** Staff roles only: a guest or supplier login cannot approve. */
const STAFF = ROLE_KEYS.filter((r) => !isGuest(r));
const DATE = { style: { width: '100%' }, format: 'DD MMM YYYY' } as const;

interface Values {
  fromUserId?: string;
  toUserId: string;
  startsOn: dayjs.Dayjs;
  endsOn: dayjs.Dayjs;
  note?: string;
}

/** "Ravi Kumar approves for you, 10 Nov to 20 Nov 2026": one delegation in words, from the reader's side. */
function delegationWords(d: ApprovalDelegationDto, me: string | undefined) {
  const when = `${formatDate(d.startsOn)} to ${formatDate(d.endsOn)}`;
  if (d.fromUserId === me) return `${d.toName} approves for you, ${when}`;
  if (d.toUserId === me) return `You approve for ${d.fromName}, ${when}`;
  return `${d.toName} approves for ${d.fromName}, ${when}`;
}

/**
 * Hand approvals to someone while away: from the first day to the last, they decide what waits on the person away too,
 * with that person's limits, and are told of it. `forAnyone` (an admin) chooses who is away; anyone else hands over their own.
 */
export function DelegationForm({ open, onClose, forAnyone = false }: { open: boolean; onClose: () => void; forAnyone?: boolean }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { user } = useAuth();
  const create = useCreateDelegation();
  const fromUserId = Form.useWatch('fromUserId', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ startsOn: dayjs(), endsOn: dayjs().add(6, 'day') });
  }, [open, form]);

  const submit = async (v: Values) => {
    const d = await create.mutateAsync({
      ...(forAnyone && v.fromUserId ? { fromUserId: v.fromUserId } : {}),
      toUserId: v.toUserId,
      startsOn: v.startsOn.format('YYYY-MM-DD'),
      endsOn: v.endsOn.format('YYYY-MM-DD'),
      note: v.note?.trim() || undefined,
    });
    message.success(delegationWords(d, user?.id));
    return d;
  };

  const away = forAnyone ? fromUserId : user?.id;
  return (
    <FormShell open={open} onClose={onClose} form={form} layout="modal" title={forAnyone ? 'Hand someone’s approvals over' : 'Approvals while you are away'} okText="Hand over approvals" onSubmit={submit} width={560} projectDefault={false}>
      <Form form={form} layout="vertical">
        <Typography.Paragraph type="secondary">
          From the first day to the last, they decide what waits on {forAnyone ? 'the person away' : 'you'} as well as their own, with {forAnyone ? 'that person’s' : 'your'} limits, and are told of it. Nobody decides an entry they or the person away made.
        </Typography.Paragraph>
        {forAnyone ? (
          <Form.Item name="fromUserId" label="Who is away" rules={[{ required: true, message: 'Choose who is away' }]}>
            <UserSelect roles={STAFF} />
          </Form.Item>
        ) : null}
        <Form.Item
          name="toUserId"
          label="Who approves meanwhile"
          dependencies={['fromUserId']}
          rules={[
            { required: true, message: 'Choose who approves meanwhile' },
            { validator: async (_, v) => (v && v === away ? Promise.reject(new Error('Choose someone else: a person cannot approve for themselves')) : undefined) },
          ]}
        >
          <UserSelect roles={STAFF} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="startsOn" label="First day" rules={[{ required: true, message: 'Choose the first day' }]}>
            <DatePicker {...DATE} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
          <Form.Item
            name="endsOn"
            label="Last day"
            dependencies={['startsOn']}
            rules={[
              { required: true, message: 'Choose the last day' },
              ({ getFieldValue }) => ({
                validator: async (_, v: dayjs.Dayjs | undefined) => (v && getFieldValue('startsOn') && v.isBefore(getFieldValue('startsOn'), 'day') ? Promise.reject(new Error('Choose a last day on or after the first day')) : undefined),
              }),
            ]}
          >
            <DatePicker {...DATE} disabledDate={(d) => d.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="note" label="Note">
          <Input maxLength={200} placeholder="On leave, at the client's office…" />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** The Approvals page's header action: who approves for you while you are away (and for whom you approve), and handing over. */
export function AwayButton() {
  const { user } = useAuth();
  const { data } = useApprovalDelegations(false, !!user && !isGuest(user.roleKey));
  const [open, setOpen] = useState(false);
  const mine = (data ?? []).filter((d) => d.fromUserId === user?.id);
  const forOthers = (data ?? []).filter((d) => d.toUserId === user?.id && d.active);
  const label = mine.some((d) => d.active) ? `Away: ${mine.find((d) => d.active)!.toName} approves for you` : 'While you are away';
  if (!user || isGuest(user.roleKey)) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      {forOthers.length ? (
        <Typography.Text type="secondary" style={{ marginInlineStart: tk.space[2] }}>
          You approve for {forOthers.map((d) => d.fromName).join(', ')}
        </Typography.Text>
      ) : null}
      <AwayModal open={open} onClose={() => setOpen(false)} delegations={data ?? []} />
    </>
  );
}

function AwayModal({ open, onClose, delegations }: { open: boolean; onClose: () => void; delegations: ApprovalDelegationDto[] }) {
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (open) setAdding(!delegations.length);
  }, [open, delegations.length]);
  if (adding) return <DelegationForm open={open} onClose={onClose} />;
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Approvals while you are away"
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          Hand over approvals
        </Button>,
      ]}
    >
      <DelegationList delegations={delegations} />
    </Modal>
  );
}

/** Delegations as lines, each with End: the caller's own on the Approvals page, everyone's for an admin. */
export function DelegationList({ delegations }: { delegations: ApprovalDelegationDto[] }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const end = useEndDelegation();
  return (
    <Flex vertical gap={tk.space[2]}>
      {delegations.map((d) => (
        <Flex key={d.id} align="center" justify="space-between" gap={tk.space[3]} wrap>
          <span>
            {delegationWords(d, user?.id)}
            {d.active ? (
              <AppTag meaning="waiting" style={{ marginInlineStart: tk.space[2] }}>
                Now
              </AppTag>
            ) : null}
            {d.note ? <Typography.Text type="secondary"> · {d.note}</Typography.Text> : null}
          </span>
          <Button size="small" loading={end.isPending && end.variables === d.id} onClick={() => end.mutate(d.id, { onSuccess: () => message.success('Delegation ended') })}>
            End
          </Button>
        </Flex>
      ))}
    </Flex>
  );
}

/** Users page, for an admin: everyone's approvals handed over while away, and handing someone's over. */
export function DelegationsAdmin() {
  const { data, isLoading } = useApprovalDelegations(true);
  const [open, setOpen] = useState(false);
  const { message } = App.useApp();
  const end = useEndDelegation();
  return (
    <>
      <Flex align="center" justify="space-between" gap={tk.space[3]} wrap style={{ marginBottom: tk.space[2] }}>
        <Typography.Text type="secondary">While someone is away, the person they hand over to decides what waits on them too, with their limits.</Typography.Text>
        <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Hand over approvals
        </Button>
      </Flex>
      <Table<ApprovalDelegationDto>
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={data ?? []}
        scroll={{ x: 640 }}
        locale={{ emptyText: 'Nobody has handed over their approvals' }}
        columns={[
          { title: 'Away', dataIndex: 'fromName', render: (v: string) => <span translate="no">{v}</span> },
          { title: 'Approves meanwhile', dataIndex: 'toName', render: (v: string) => <span translate="no">{v}</span> },
          { title: 'Days', key: 'days', render: (_, d) => `${formatDate(d.startsOn)} to ${formatDate(d.endsOn)}` },
          { title: 'Now', key: 'now', width: 90, render: (_, d) => (d.active ? <AppTag meaning="waiting">Now</AppTag> : <Typography.Text type="secondary">From {formatDate(d.startsOn)}</Typography.Text>) },
          {
            title: '',
            key: 'end',
            width: 90,
            render: (_, d) => (
              <Button size="small" aria-label={`End ${d.fromName}'s delegation`} loading={end.isPending && end.variables === d.id} onClick={() => end.mutate(d.id, { onSuccess: () => message.success('Delegation ended') })}>
                End
              </Button>
            ),
          },
        ]}
      />
      <DelegationForm open={open} onClose={() => setOpen(false)} forAnyone />
    </>
  );
}
