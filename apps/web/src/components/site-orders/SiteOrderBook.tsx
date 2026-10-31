'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Drawer, Flex, Form, Input, Select, Space, Typography } from 'antd';
import type { UseQueryResult } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  CHECK_LEVELS,
  CHECK_LEVEL_LABELS,
  SITE_ORDER_DEFAULT_DAYS,
  SITE_ORDER_STATE_COLORS,
  SITE_ORDER_STATE_LABELS,
  canApprove,
  canKeepSiteOrders,
  isGuest,
  type CheckLevel,
  type SiteOrderDto,
} from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDecideSiteOrder, useRecordSiteOrder, useSiteOrderAction, useWriteSiteOrder } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';
import { AppTag, toneOf } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { QueryError } from '@/components/common/QueryState';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { PlusOutlined } from '@/components/common/icons';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import { type ListColumn } from '@/components/list/DataTable';
import { RecordLink } from '@/components/record/RecordLink';
import { FormGrid, FormShell } from '@/components/form/FormShell';

const StateTag = ({ o }: { o: SiteOrderDto }) => (
  <AppTag tone={toneOf(SITE_ORDER_STATE_COLORS[o.state])} dot>
    {SITE_ORDER_STATE_LABELS[o.state]}
  </AppTag>
);

/**
 * The site order book: the engineer's instructions, numbered per project, with the site's compliance and the
 * engineer accepting it. The same book in the client portal (`portal`: write an order, accept or send back a reply) and
 * on the project's Site orders tab (copy one in from the paper book, reply with the compliance).
 */
export function SiteOrderBook({ projectId, orders, portal, openId, onOpen }: { projectId: string; orders: UseQueryResult<SiteOrderDto[]>; portal: boolean; openId: string | null; onOpen: (id: string | null) => void }) {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = orders;
  const [writing, setWriting] = useState(false);
  const mayWrite = !!user && (portal ? isGuest(user.roleKey) : canKeepSiteOrders(user.roleKey));
  const open = data?.find((o) => o.id === openId) ?? null;
  const newButton = mayWrite ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setWriting(true)}>
      {portal ? 'Write an order' : 'Record an order'}
    </Button>
  ) : null;

  const columns: ListColumn<SiteOrderDto>[] = [
    { key: 'no', card: 'title', cardText: (o) => o.label, title: 'Order', locked: true, width: 110, render: (_, o) => <RecordLink onOpen={() => onOpen(o.id)}>{o.label}</RecordLink> },
    { key: 'date', card: 'date', cardText: (o) => formatDate(o.date), title: 'Date', width: 110, render: (_, o) => formatDate(o.date) },
    {
      key: 'instruction',
      card: 'meta',
      cardText: (o) => o.instruction,
      title: 'Instruction',
      ellipsis: true,
      render: (_, o) => (
        <div>
          <div style={{ whiteSpace: 'normal' }}>{o.instruction.length > 160 ? `${o.instruction.slice(0, 159)}…` : o.instruction}</div>
          {o.location ? (
            <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
              {o.location}
            </div>
          ) : null}
        </div>
      ),
    },
    { key: 'by', card: 'meta', cardText: (o) => o.issuedByName, title: 'Written by', width: 180, render: (_, o) => <span>{o.issuedByName}{o.issuedByLevel ? <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>{CHECK_LEVEL_LABELS[o.issuedByLevel]}</div> : null}</span> },
    { key: 'comply', title: 'Comply by', width: 110, render: (_, o) => (o.complyBy ? <Typography.Text type={o.state === 'OVERDUE' ? 'danger' : undefined}>{formatDate(o.complyBy)}</Typography.Text> : '-') },
    { key: 'state', card: 'status', cardText: (o) => SITE_ORDER_STATE_LABELS[o.state], title: 'Status', width: 190, render: (_, o) => <StateTag o={o} /> },
  ];

  return (
    <>
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {newButton ? (
        <Flex justify="flex-end" style={{ padding: 12 }}>
          {newButton}
        </Flex>
      ) : null}
      <LocalDataTable<SiteOrderDto>
        list={portal ? 'portal-site-orders' : 'site-orders'}
        columns={columns}
        rows={data ?? []}
        loading={isLoading}
        failed={!!error}
        onOpen={onOpen}
        scrollX={900}
        emptyText={portal ? 'No orders in the book yet. Write one when the site needs an instruction.' : 'No site orders yet. Record one from the paper book, or the engineer writes one in their portal.'}
      />
      <SiteOrderDrawer data={open} portal={portal} onClose={() => onOpen(null)} />
      {portal ? <WriteOrderForm projectId={projectId} open={writing} onClose={() => setWriting(false)} /> : <RecordOrderForm projectId={projectId} open={writing} onClose={() => setWriting(false)} />}
    </>
  );
}

interface OrderValues {
  date: dayjs.Dayjs;
  instruction: string;
  location?: string;
  complyBy?: dayjs.Dayjs | null;
  issuedByName?: string;
  issuedByLevel?: CheckLevel | null;
}

const orderBody = (v: OrderValues) => ({
  date: v.date.format('YYYY-MM-DD'),
  instruction: v.instruction.trim(),
  location: v.location?.trim() || null,
  complyBy: v.complyBy ? v.complyBy.format('YYYY-MM-DD') : null,
});

function OrderFields({ staff }: { staff: boolean }) {
  return (
    <>
      <FormGrid cols={2}>
        <Form.Item name="date" label="Order date" rules={[{ required: true, message: 'Pick the order date' }]}>
          <DatePicker allowClear={false} style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name="complyBy" label="Comply by" extra={`${SITE_ORDER_DEFAULT_DAYS} days after the order unless you change it`}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </FormGrid>
      {staff ? (
        <FormGrid cols={2}>
          <Form.Item name="issuedByName" label="Written by" rules={[{ required: true, whitespace: true, message: 'Name the engineer who signed the order' }]}>
            <Input maxLength={160} placeholder="As signed in the book" />
          </Form.Item>
          <Form.Item name="issuedByLevel" label="Their level">
            <Select allowClear placeholder="Not known" options={CHECK_LEVELS.map((l) => ({ value: l, label: CHECK_LEVEL_LABELS[l] }))} />
          </Form.Item>
        </FormGrid>
      ) : null}
      <Form.Item name="location" label="Where">
        <Input maxLength={200} placeholder="Deck slab, span 2" />
      </Form.Item>
      <Form.Item name="instruction" label="Instruction" rules={[{ required: true, whitespace: true, message: 'Write the instruction, as the site should act on it' }]}>
        <Input.TextArea rows={5} maxLength={4000} showCount />
      </Form.Item>
    </>
  );
}

/** The engineer writes an order from the portal; the site is told to reply with its compliance. */
function WriteOrderForm({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const write = useWriteSiteOrder(projectId);
  const [form] = Form.useForm<OrderValues>();
  useEffect(() => {
    if (open) form.setFieldsValue({ date: dayjs(), complyBy: dayjs().add(SITE_ORDER_DEFAULT_DAYS, 'day') });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title="Write a site order"
      okText="Write order"
      draftKey={`site-order:${projectId}`}
      projectDefault={false}
      onSubmit={async (v) => {
        const o = await write.mutateAsync(orderBody(v));
        message.success(`${o.label} written. The site is told to reply with its compliance.`);
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <OrderFields staff={false} />
      </Form>
    </FormShell>
  );
}

/** Staff copy an order in from the paper book, naming who wrote it. */
function RecordOrderForm({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const record = useRecordSiteOrder();
  const [form] = Form.useForm<OrderValues>();
  useEffect(() => {
    if (open) form.setFieldsValue({ date: dayjs(), complyBy: dayjs().add(SITE_ORDER_DEFAULT_DAYS, 'day') });
  }, [open, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      title="Record a site order"
      okText="Record order"
      draftKey={`site-order-book:${projectId}`}
      projectDefault={false}
      onSubmit={async (v) => {
        const o = await record.mutateAsync({ projectId, ...orderBody(v), issuedByName: v.issuedByName!.trim(), issuedByLevel: v.issuedByLevel ?? null });
        message.success(`${o.label} recorded`);
      }}
    >
      <Typography.Paragraph type="secondary">Copy the order as it reads in the paper book. It takes the project&apos;s next number.</Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false}>
        <OrderFields staff />
      </Form>
    </FormShell>
  );
}

function SiteOrderDrawer({ data, portal, onClose }: { data: SiteOrderDto | null; portal: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const action = useSiteOrderAction();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const staff = !!user && !isGuest(user.roleKey);
  const mayDelete = !portal && !!data && !data.fromPortal && data.status === 'OPEN' && !data.reply && !!user && (canApprove(user.roleKey) || data.recordedByName === user.fullName);
  return (
    <Drawer
      open={!!data}
      onClose={onClose}
      size={680}
      destroyOnHidden
      title={
        data ? (
          <Space size={8} wrap>
            <span>{data.label}</span>
            <StateTag o={data} />
          </Space>
        ) : (
          'Site order'
        )
      }
      extra={
        mayDelete && data ? (
          <Button
            danger
            onClick={() =>
              askDelete({
                what: data.label,
                description: 'The order comes out of the book. Delete it only if it was copied in by mistake.',
                notice: `${data.label} deleted`,
                onConfirm: async () => {
                  await action.mutateAsync({ id: data.id, action: 'delete' });
                  onClose();
                },
              })
            }
          >
            Delete
          </Button>
        ) : null
      }
    >
      {data && (
        <>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.instruction}</Typography.Paragraph>
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'date', label: 'Written', children: formatDate(data.date) },
              { key: 'comply', label: 'Comply by', children: data.complyBy ? formatDate(data.complyBy) : '-' },
              { key: 'by', label: 'Written by', span: 2, children: `${data.issuedByName}${data.issuedByLevel ? `, ${CHECK_LEVEL_LABELS[data.issuedByLevel].toLowerCase()}` : ''}${data.fromPortal ? ' (in the portal)' : ''}` },
              ...(data.location ? [{ key: 'loc', label: 'Where', span: 2, children: data.location }] : []),
              ...(data.recordedByName ? [{ key: 'rec', label: 'Copied in by', span: 2, children: data.recordedByName }] : []),
            ]}
          />
          <Divider titlePlacement="start" plain>
            Compliance
          </Divider>
          {data.status === 'OPEN' && data.closeNote ? <Alert type="warning" showIcon style={{ marginBottom: 8 }} title="Sent back by the engineer" description={data.closeNote} /> : null}
          {data.reply ? (
            <>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.reply}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">
                {data.repliedByName}, {formatDate(data.repliedOn)}
                {data.status === 'OPEN' ? ' (earlier reply)' : ''}
              </Typography.Paragraph>
            </>
          ) : (
            <Typography.Paragraph type="secondary">No reply yet.</Typography.Paragraph>
          )}
          {staff && !portal && data.status === 'OPEN' && canKeepSiteOrders(user!.roleKey) ? (
            <TextAction
              key={`reply-${data.id}`}
              label="Your compliance reply"
              placeholder="What was done, when, and where it can be seen"
              button="Send reply"
              required="Write what was done to comply"
              busy={action.isPending}
              onSend={async (text) => {
                await action.mutateAsync({ id: data.id, action: 'reply', text });
                message.success(`Reply to ${data.label} sent`);
              }}
            />
          ) : null}
          {staff && !portal && data.status === 'REPLIED' && !data.fromPortal && canKeepSiteOrders(user!.roleKey) ? (
            <TextAction
              key={`close-${data.id}`}
              label="Note on closing"
              placeholder="Accepted in the book on…"
              button="Close: accepted in the book"
              busy={action.isPending}
              onSend={async (text) => {
                await action.mutateAsync({ id: data.id, action: 'close', text: text || null });
                message.success(`${data.label} closed`);
              }}
            />
          ) : null}
          {portal && data.status === 'REPLIED' && !!user && isGuest(user.roleKey) ? <DecideBox key={`decide-${data.id}`} order={data} /> : null}
          {data.status === 'CLOSED' ? (
            <>
              <Divider titlePlacement="start" plain>
                Closed
              </Divider>
              <Typography.Paragraph type="secondary">
                {data.closedByName}, {formatDate(data.closedOn)}
                {data.closeNote ? `: ${data.closeNote}` : ''}
              </Typography.Paragraph>
            </>
          ) : null}
        </>
      )}
      {deleteDialog}
    </Drawer>
  );
}

/** A box and a button: the site's reply, or a note when closing. */
function TextAction({ label, placeholder, button, required, busy, onSend }: { label: string; placeholder: string; button: string; required?: string; busy: boolean; onSend: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const send = async () => {
    if (required && !text.trim()) return setProblem(required);
    setProblem(null);
    try {
      await onSend(text.trim());
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      {problem ? <Alert type="error" showIcon role="alert" style={{ marginBottom: 8 }} title={problem} /> : null}
      <Input.TextArea aria-label={label} rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      <Flex justify="flex-end" style={{ marginTop: 8 }}>
        <Button type="primary" loading={busy} onClick={send}>
          {button}
        </Button>
      </Flex>
    </div>
  );
}

/** The engineer accepts the compliance (closing the order) or sends it back with what is still to be done. */
function DecideBox({ order }: { order: SiteOrderDto }) {
  const { message } = App.useApp();
  const decide = useDecideSiteOrder();
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const go = async (accept: boolean) => {
    if (!accept && !note.trim()) return setProblem('Say what is still to be done');
    setProblem(null);
    try {
      await decide.mutateAsync({ id: order.id, accept, note: note.trim() || null });
      message.success(accept ? `${order.label} closed` : `${order.label} sent back to the site`);
    } catch (e) {
      setProblem(errorMessage(e));
    }
  };
  return (
    <div style={{ marginTop: 8 }}>
      {problem ? <Alert type="error" showIcon role="alert" style={{ marginBottom: 8 }} title={problem} /> : null}
      <Input.TextArea aria-label="Your note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note on accepting, or what is still to be done" />
      <Flex justify="flex-end" gap={8} style={{ marginTop: 8 }} wrap>
        <Button loading={decide.isPending} onClick={() => go(false)}>
          Send back
        </Button>
        <Button type="primary" loading={decide.isPending} onClick={() => go(true)}>
          Accept and close
        </Button>
      </Flex>
    </div>
  );
}
