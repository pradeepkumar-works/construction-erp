'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Flex, Form, Input, Select, Timeline, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { AttachmentDto, LetterAction, LetterDto, LetterMode, LetterPrintDto, LetterRefDto } from '@erp/shared';
import {
  LETTER_ACTIONS,
  LETTER_ACTION_HINTS,
  LETTER_ACTION_LABELS,
  LETTER_MODES,
  LETTER_MODE_LABELS,
  LETTER_PRIORITY_LABELS,
  LETTER_TRACKED_MODES,
  canViewLetters,
  isContractualCategory,
  letterNeedsApproval,
} from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FAIL_NOTICE, useNotify } from '@/lib/notify';
import { useLetter, useLetterPeople, useLetterSettings } from '@/lib/queries';
import { formatDate, formatDateTime } from '@/lib/format';
import { AppTag } from '@/components/common/AppTag';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { DatePicker } from '@/components/common/DatePicker';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { EditOutlined, MailOutlined, PrinterOutlined, RollbackOutlined, SendOutlined } from '@/components/common/icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import type { Lifecycle } from '@/components/record/lifecycle';
import { LetterForm, type LetterPrefill } from './LetterForm';
import { DirectionTag, LetterStatusTag, letterHref, letterLabel, useInvalidateLetters } from './letterUi';
import { printLetter } from './letterPrint';

type Action = 'mark' | 'close' | 'send' | 'return' | 'dispatch';

interface ActionValues {
  toId?: string;
  action?: LetterAction;
  dueOn?: dayjs.Dayjs | null;
  note?: string;
  signatoryId?: string;
  mode?: LetterMode;
  docketNo?: string;
  dispatchedOn?: dayjs.Dayjs;
  deliveredOn?: dayjs.Dayjs | null;
  deliveryProof?: string;
  files?: AttachmentDto[];
}

const ymd = (d: dayjs.Dayjs | null | undefined) => (d ? d.format('YYYY-MM-DD') : null);

/** Where the letter stands: received, marked, closed; or drafted, approved, issued, dispatched, delivered. */
function lifecycleOf(l: LetterDto): Lifecycle {
  if (l.direction === 'IN') {
    const marked = l.marks.length > 0;
    return {
      current: l.status === 'CLOSED' ? 2 : marked ? 1 : 0,
      status: l.status === 'CLOSED' ? 'finish' : 'process',
      items: [
        { title: 'Received', content: formatDate(l.receivedOn ?? l.letterDate) },
        { title: marked ? `With ${l.markedToName ?? 'staff'}` : 'Mark to someone', content: l.actionDue ? `${LETTER_ACTION_LABELS[l.action ?? 'REPLY']} by ${formatDate(l.actionDue)}` : undefined },
        { title: 'Closed', content: l.closedAt ? formatDate(l.closedAt.slice(0, 10)) : undefined },
      ],
    };
  }
  // A letter that waits for head office's seal shows it as a stage of its own between signing and issue
  const seal = l.needsSeal || !!l.signedAt;
  const signed = l.signedAt ?? l.approvedAt;
  const waiting = l.status === 'AWAITING_APPROVAL' ? (l.signedAt ? 2 : 1) : 0;
  const after = seal ? 1 : 0;
  const stage = l.status === 'DRAFT' ? 0 : waiting || (l.deliveredOn ? 4 + after : l.dispatchedOn ? 3 + after : 2 + after);
  return {
    current: stage,
    status: l.status === 'DRAFT' && l.returnNote ? 'error' : stage === 4 + after ? 'finish' : 'process',
    items: [
      { title: l.returnNote && l.status === 'DRAFT' ? 'Returned' : 'Drafted', content: l.createdByName },
      { title: 'Signed', content: signed ? `${l.signedByName ?? l.signatoryName ?? ''}, ${formatDate(signed.slice(0, 10))}` : (l.signatoryName ?? undefined) },
      ...(seal ? [{ title: 'Sealed at head office', content: l.approvedAt && l.signedAt ? formatDate(l.approvedAt.slice(0, 10)) : l.signedAt ? 'Waiting for a director' : undefined }] : []),
      { title: 'Issued', content: l.letterNo ?? undefined },
      { title: 'Dispatched', content: l.dispatchedOn ? `${l.mode ? LETTER_MODE_LABELS[l.mode] : ''} ${formatDate(l.dispatchedOn)}`.trim() : undefined },
      { title: 'Delivered', content: l.deliveredOn ? formatDate(l.deliveredOn) : undefined },
    ],
  };
}

/** What happened to it, oldest first, from the letter itself and its marks. */
function storyOf(l: LetterDto): { key: string; at: string; text: React.ReactNode }[] {
  const out: { key: string; at: string; text: React.ReactNode }[] = [];
  out.push({ key: 'made', at: l.createdAt, text: l.direction === 'IN' ? `Recorded by ${l.createdByName}` : `Drafted by ${l.createdByName}` });
  for (const m of l.marks)
    out.push({
      key: `mark-${m.id}`,
      at: m.createdAt,
      text: (
        <span>
          {m.fromName} marked it to <b>{m.toName}</b> to {LETTER_ACTION_LABELS[m.action].toLowerCase()}
          {m.dueOn ? ` by ${formatDate(m.dueOn)}` : ''}
          {m.note ? <Typography.Text type="secondary">: {m.note}</Typography.Text> : null}
          {m.doneAt ? <Typography.Text type="secondary"> · done {formatDateTime(m.doneAt)}{m.doneNote ? `: ${m.doneNote}` : ''}</Typography.Text> : null}
        </span>
      ),
    });
  if (l.sentForApprovalAt) out.push({ key: 'sent', at: l.sentForApprovalAt, text: `Sent to ${l.signatoryName ?? 'the signatory'} for approval` });
  if (l.signedAt) out.push({ key: 'signed', at: l.signedAt, text: `Signed by ${l.signedByName ?? l.signatoryName ?? 'the signatory'}; sent to head office for the seal` });
  if (l.approvedAt) out.push({ key: 'approved', at: l.approvedAt, text: l.signedAt ? `Sealed at head office and numbered ${l.letterNo ?? ''}` : `Signed by ${l.signatoryName ?? 'the signatory'} and numbered ${l.letterNo ?? ''}` });
  if (l.dispatchedOn) out.push({ key: 'dispatched', at: `${l.dispatchedOn}T23:59:00`, text: `Dispatched by ${l.mode ? LETTER_MODE_LABELS[l.mode].toLowerCase() : 'hand'}${l.docketNo ? `, ${l.docketNo}` : ''}` });
  if (l.deliveredOn) out.push({ key: 'delivered', at: `${l.deliveredOn}T23:59:30`, text: `Delivered${l.deliveryProof ? `: ${l.deliveryProof}` : ''}` });
  if (l.closedAt) out.push({ key: 'closed', at: l.closedAt, text: `Closed by ${l.closedByName ?? ''}${l.closedNote ? `: ${l.closedNote}` : ''}` });
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

function RefLine({ l }: { l: LetterRefDto }) {
  return (
    <Flex gap={8} align="baseline" wrap>
      <DirectionTag direction={l.direction} />
      <Link href={letterHref(l.id)} className="mono" translate="no">
        {letterLabel(l)}
      </Link>
      <Typography.Text type="secondary">{formatDate(l.letterDate)}</Typography.Text>
      <span>{l.subject}</span>
    </Flex>
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
}

/**
 * A letter, in a drawer or at `/correspondence/<id>`: one received with who has it and what they must do,
 * or one we send with its signing, number, dispatch and proof of delivery.
 */
export function LetterRecord({ id, mode, open, onClose }: RecordProps & { mode: RecordMode }) {
  const { user } = useAuth();
  const notify = useNotify();
  const invalidate = useInvalidateLetters();
  const [form] = Form.useForm<ActionValues>();
  const [action, setAction] = useState<Action | null>(null);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState<LetterPrefill | null>(null);
  const [askDelete, deleteDialog] = useConfirmDelete();
  const { data, isLoading, error, refetch } = useLetter(id ?? undefined);
  const keeper = !!user && canViewLetters(user.roleKey);
  const { data: settings } = useLetterSettings(!!data && data.direction === 'OUT' && data.status === 'DRAFT');
  const { data: people } = useLetterPeople(data?.projectId, !!data && (action === 'mark' || action === 'send'));

  const post = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) => (await api.post<LetterDto>(`/letters/${id}/${path}`, body ?? {})).data,
    onSuccess: () => invalidate(),
    meta: FAIL_NOTICE,
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`/letters/${id}`)).data,
    onSuccess: () => {
      invalidate();
      onClose?.();
    },
  });

  const run = async (path: string, done: (l: LetterDto) => string, body?: unknown) => {
    const l = await post.mutateAsync({ path, body });
    notify.saved(done(l), mode === 'drawer' ? letterHref(l.id) : null);
    return l;
  };

  const start = (a: Action) => {
    form.resetFields();
    if (!data) return;
    if (a === 'mark') form.setFieldsValue({ action: 'REPLY', dueOn: data.replyBy ? dayjs(data.replyBy) : null });
    if (a === 'send') form.setFieldsValue({ signatoryId: data.signatoryId ?? undefined });
    if (a === 'dispatch')
      form.setFieldsValue({
        mode: data.mode ?? 'HAND',
        docketNo: data.docketNo ?? undefined,
        dispatchedOn: data.dispatchedOn ? dayjs(data.dispatchedOn) : dayjs(),
        deliveredOn: data.deliveredOn ? dayjs(data.deliveredOn) : null,
        deliveryProof: data.deliveryProof ?? undefined,
      });
    setAction(a);
  };

  const submit = async (v: ActionValues) => {
    if (!data) return;
    switch (action) {
      case 'mark':
        return run('mark', (l) => `${letterLabel(l)} marked to ${l.markedToName}`, { toId: v.toId, action: v.action, dueOn: ymd(v.dueOn), note: v.note?.trim() || null });
      case 'close':
        return run('close', (l) => `${letterLabel(l)} closed`, { note: v.note?.trim() || null });
      case 'send':
        return run('send-for-approval', (l) => `Sent to ${l.signatoryName} for approval`, { signatoryId: v.signatoryId });
      case 'return':
        return run('return', () => 'Returned to the writer with your changes', { note: v.note?.trim() });
      case 'dispatch':
        return run('dispatch', (l) => (l.deliveredOn ? `${letterLabel(l)} delivered` : `${letterLabel(l)} dispatched`), {
          mode: v.mode,
          docketNo: v.docketNo?.trim() || null,
          dispatchedOn: ymd(v.dispatchedOn),
          deliveredOn: ymd(v.deliveredOn),
          deliveryProof: v.deliveryProof?.trim() || null,
          attachmentIds: (v.files ?? []).map((f) => f.id),
        });
    }
  };

  const print = async () => {
    if (!data) return;
    try {
      const opened = await printLetter(async () => (await api.get<LetterPrintDto>(`/letters/${data.id}/print`)).data);
      if (!opened) notify.failed(new Error('The browser blocked the print window. Allow pop-ups for this site and try again.'));
    } catch (e) {
      notify.failed(e);
    }
  };

  const isIn = data?.direction === 'IN';
  const needsApproval = !!data && !!settings && letterNeedsApproval(settings.approval, data.category);
  const modeValue = Form.useWatch('mode', form);

  const actions = (size: 'small' | 'middle') => {
    if (!data) return null;
    const c = data.can;
    if (isIn)
      return (
        <>
          {data.status === 'OPEN' && keeper ? (
            <Button
              size={size}
              type={data.awaitingReply ? 'primary' : 'default'}
              icon={<RollbackOutlined />}
              onClick={() => setReply({ projectId: data.projectId, party: data.party, contactId: data.contactId, subject: `Re: ${data.subject}`, inReplyToId: data.id, riskId: data.riskId, category: data.category, theirRef: data.theirRef, theirDate: data.letterDate })}
            >
              Reply
            </Button>
          ) : null}
          {c.mark ? (
            <Button size={size} icon={<SendOutlined />} onClick={() => start('mark')}>
              {data.markedToId ? 'Forward' : 'Mark to'}
            </Button>
          ) : null}
          {c.close && data.status === 'OPEN' ? (
            <Button size={size} onClick={() => start('close')}>
              Close
            </Button>
          ) : null}
          {c.close && data.status === 'CLOSED' ? (
            <Button size={size} loading={post.isPending} onClick={() => run('reopen', (l) => `${letterLabel(l)} reopened`)}>
              Reopen
            </Button>
          ) : null}
          {c.edit ? (
            <Button size={size} icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </>
      );
    return (
      <>
        {c.sign ? (
          <>
            <Button size={size} type="primary" loading={post.isPending} onClick={() => run('approve', (l) => (l.letterNo ? `Signed: ${l.letterNo}` : 'Signed; sent to head office for the seal'))}>
              {data.signedAt ? 'Seal and number' : data.needsSeal ? 'Sign and send to head office' : 'Approve and number'}
            </Button>
            <Button size={size} onClick={() => start('return')}>
              Return with changes
            </Button>
          </>
        ) : null}
        {c.edit && data.status === 'DRAFT' ? (
          <>
            {needsApproval ? (
              <Button size={size} type="primary" icon={<SendOutlined />} onClick={() => start('send')}>
                Send for approval
              </Button>
            ) : (
              <>
                <Button size={size} type="primary" loading={post.isPending} onClick={() => run('issue', (l) => `Issued as ${l.letterNo}`)}>
                  Issue
                </Button>
                <Button size={size} onClick={() => start('send')}>
                  Send for signature
                </Button>
              </>
            )}
            <Button size={size} icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </>
        ) : null}
        {c.dispatch ? (
          <Button size={size} type={data.dispatchedOn ? 'default' : 'primary'} icon={<MailOutlined />} onClick={() => start('dispatch')}>
            {data.dispatchedOn ? 'Record delivery' : 'Record dispatch'}
          </Button>
        ) : null}
        {data.status !== 'DRAFT' || data.body ? (
          <Button size={size} icon={<PrinterOutlined />} onClick={print}>
            {data.letterNo ? 'Print' : 'Print draft'}
          </Button>
        ) : null}
      </>
    );
  };

  const titles: Record<Action, string> = {
    mark: data?.markedToId ? 'Forward the letter' : 'Mark the letter',
    close: 'Close the letter',
    send: needsApproval ? 'Send for approval' : 'Send for signature',
    return: 'Return with changes',
    dispatch: data?.dispatchedOn ? 'Record delivery' : 'Record dispatch',
  };

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={780}
      kind="Letter"
      list={isIn === false ? { href: '/correspondence/outward', label: 'Outward register' } : { href: '/correspondence', label: 'Inward register' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: letterHref(data.id),
          title: (
            <span>
              <span className="mono" translate="no">
                {letterLabel(data)}
              </span>{' '}
              · {data.subject}
            </span>
          ),
          tags: (
            <Flex gap={4} wrap>
              <DirectionTag direction={data.direction} />
              <LetterStatusTag status={data.status} />
              {data.priority === 'URGENT' ? <AppTag tone="danger">{LETTER_PRIORITY_LABELS.URGENT}</AppTag> : null}
              {data.confidential ? <AppTag tone="violet">Confidential</AppTag> : null}
              {data.overdue ? <AppTag tone="danger">Reply overdue</AppTag> : null}
              {data.actionOverdue ? <AppTag tone="danger">Action overdue</AppTag> : null}
            </Flex>
          ),
          lifecycle: lifecycleOf(data),
          notices: (
            <>
              {data.status === 'DRAFT' && data.returnNote ? <Alert type="warning" showIcon title={`Returned by ${data.signatoryName ?? 'the signatory'}`} description={data.returnNote} /> : null}
              {data.proofMissing ? <Alert type="warning" showIcon title="No proof of delivery" description="A contractual letter needs proof it arrived: the acknowledged copy, or the speed post or courier delivery record." /> : null}
            </>
          ),
          facts: [
            { key: 'party', label: isIn ? 'From' : 'To', span: 2, children: data.party },
            { key: 'project', label: 'Project', children: data.projectId ? <Link href={`/projects/${data.projectId}`}>{data.projectName}</Link> : 'Head office' },
            { key: 'category', label: 'Category', children: data.categoryName ?? 'General' },
            { key: 'date', label: 'Dated', children: formatDate(data.letterDate) },
            ...(isIn ? [{ key: 'received', label: 'Received on', children: data.receivedOn ? formatDate(data.receivedOn) : '-' }] : []),
            { key: 'ref', label: isIn ? 'Their reference' : 'Reference', children: data.theirRef ?? '-' },
            ...(data.mode ? [{ key: 'mode', label: isIn ? 'Came by' : 'Sent by', children: `${LETTER_MODE_LABELS[data.mode]}${data.docketNo ? `, ${data.docketNo}` : ''}` }] : []),
            {
              key: 'reply',
              label: isIn ? 'Reply needed by' : 'Their reply by',
              children: data.replyBy ? (
                <span className={data.overdue ? 'text-danger' : undefined}>
                  {formatDate(data.replyBy)}
                  {data.awaitingReply ? (data.overdue ? ' (overdue)' : '') : data.replies.length ? ' (replied)' : ''}
                </span>
              ) : (
                'No reply needed'
              ),
            },
            ...(isIn && data.markedToName
              ? [
                  {
                    key: 'marked',
                    label: 'With',
                    children: (
                      <span className={data.actionOverdue ? 'text-danger' : undefined}>
                        {data.markedToName}, to {LETTER_ACTION_LABELS[data.action ?? 'REPLY'].toLowerCase()}
                        {data.actionDue ? ` by ${formatDate(data.actionDue)}` : ''}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(!isIn ? [{ key: 'sign', label: 'Signed by', children: data.signedByName ?? data.signatoryName ?? 'Not chosen yet' }] : []),
            ...(!isIn && (data.needsSeal || data.signedAt) ? [{ key: 'seal', label: 'Seal at head office', children: data.signedAt && data.letterNo ? 'Sealed' : data.signedAt ? 'Waiting for a director' : 'After it is signed' }] : []),
            ...(!isIn && data.dispatchedOn ? [{ key: 'dispatched', label: 'Dispatched', children: formatDate(data.dispatchedOn) }] : []),
            ...(!isIn && data.status === 'ISSUED' && (data.deliveredOn || isContractualCategory(data.category))
              ? [{ key: 'delivered', label: 'Delivered', children: data.deliveredOn ? `${formatDate(data.deliveredOn)}${data.deliveryProof ? `: ${data.deliveryProof}` : ''}` : <span className="text-danger">No proof yet</span> }]
              : []),
            ...(data.riskNo ? [{ key: 'risk', label: 'Delay / risk', span: 2, children: <Link href={`/risks?id=${data.riskId}`}>{`${data.riskNo} ${data.riskTitle}`}</Link> }] : []),
            ...(data.status === 'CLOSED' ? [{ key: 'closed', label: 'Closed', span: 2, children: `${data.closedByName ?? ''}${data.closedAt ? `, ${formatDateTime(data.closedAt)}` : ''}${data.closedNote ? `: ${data.closedNote}` : ''}` }] : []),
            { key: 'by', label: isIn ? 'Recorded by' : 'Written by', children: `${data.createdByName}, ${formatDateTime(data.createdAt)}` },
          ],
          sections: [
            ...(isIn
              ? data.summary
                ? [{ key: 'gist', title: 'Gist', children: <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{data.summary}</Typography.Paragraph> }]
                : []
              : [
                  {
                    key: 'text',
                    title: 'Letter text',
                    children: data.body ? (
                      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0, maxWidth: '72ch' }}>{data.body}</Typography.Paragraph>
                    ) : (
                      <Typography.Text type="secondary">Nothing written yet. Edit the draft to write it.</Typography.Text>
                    ),
                  },
                ]),
            ...(data.inReplyTo || data.replies.length
              ? [
                  {
                    key: 'thread',
                    title: 'Thread',
                    count: (data.inReplyTo ? 1 : 0) + data.replies.length,
                    children: (
                      <Flex vertical gap={8}>
                        {data.inReplyTo ? (
                          <div>
                            <Typography.Text type="secondary">In reply to</Typography.Text>
                            <RefLine l={data.inReplyTo} />
                          </div>
                        ) : null}
                        {data.replies.length ? (
                          <div>
                            <Typography.Text type="secondary">Replies</Typography.Text>
                            {data.replies.map((r) => (
                              <RefLine key={r.id} l={r} />
                            ))}
                          </div>
                        ) : null}
                      </Flex>
                    ),
                  },
                ]
              : []),
            { key: 'files', title: isIn ? 'Scanned letter' : 'Enclosures and proof', count: data.attachments.length, children: <AttachmentGallery attachments={data.attachments} /> },
            { key: 'history', title: 'History', children: <Timeline items={storyOf(data).map((s) => ({ key: s.key, content: <div>{s.text}<div className="text-muted">{formatDateTime(s.at)}</div></div> }))} /> },
          ],
          actions,
          more: data.can.remove
            ? [
                {
                  key: 'delete',
                  label: 'Delete',
                  danger: true,
                  onSelect: () => askDelete({ what: data.letterNo ? `letter ${data.letterNo}` : 'this draft letter', description: data.letterNo ? 'Its number is not given again.' : undefined, onConfirm: () => remove.mutateAsync() }),
                },
              ]
            : [],
          print: !isIn ? print : undefined,
        }
      }
    >
      <FormShell open={!!action} onClose={() => setAction(null)} form={form} layout="modal" width={520} title={action ? titles[action] : ''} okText={action === 'return' ? 'Return' : action === 'close' ? 'Close the letter' : 'Save'} onSubmit={submit}>
        <Form form={form} layout="vertical">
          {action === 'mark' ? (
            <>
              <Form.Item name="toId" label="Mark to" rules={[{ required: true, message: 'Choose who acts on it' }]}>
                <Select showSearch={{ optionFilterProp: 'label' }} options={(people ?? []).filter((p) => p.id !== data?.markedToId).map((p) => ({ value: p.id, label: `${p.fullName} · ${p.roleName}` }))} />
              </Form.Item>
              <FormGrid cols={2}>
                <Form.Item name="action" label="To" rules={[{ required: true, message: 'Choose what they do' }]}>
                  <Select options={LETTER_ACTIONS.map((a) => ({ value: a, label: LETTER_ACTION_LABELS[a], title: LETTER_ACTION_HINTS[a] }))} />
                </Form.Item>
                <Form.Item name="dueOn" label="By">
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </FormGrid>
              <Form.Item name="note" label="Note">
                <Input.TextArea rows={2} maxLength={1000} placeholder="Send the revised job mix with fresh gradation results" />
              </Form.Item>
            </>
          ) : null}
          {action === 'close' ? (
            <>
              <Typography.Paragraph>Close it once it is replied to, complied with, noted or filed. Whoever closed it, or the correspondence desk, can reopen it.</Typography.Paragraph>
              <Form.Item name="note" label="How it was closed">
                <Input.TextArea rows={2} maxLength={1000} placeholder="Noted; no reply needed" />
              </Form.Item>
            </>
          ) : null}
          {action === 'send' ? (
            <Form.Item name="signatoryId" label="Signed by" rules={[{ required: true, message: 'Choose who signs it' }]} extra="They approve it, and the letter gets its number then.">
              <Select showSearch={{ optionFilterProp: 'label' }} options={(people ?? []).filter((p) => p.canSign).map((p) => ({ value: p.id, label: `${p.fullName} · ${p.roleName}` }))} />
            </Form.Item>
          ) : null}
          {action === 'return' ? (
            <Form.Item name="note" label="What to change" rules={[{ required: true, whitespace: true, message: 'Say what to change' }]}>
              <Input.TextArea rows={3} maxLength={1000} placeholder="Quote the clause number in the second paragraph" />
            </Form.Item>
          ) : null}
          {action === 'dispatch' ? (
            <>
              <FormGrid cols={2}>
                <Form.Item name="mode" label="Sent by" rules={[{ required: true, message: 'Choose how it went' }]}>
                  <Select options={LETTER_MODES.map((m) => ({ value: m, label: LETTER_MODE_LABELS[m] }))} />
                </Form.Item>
                <Form.Item
                  name="docketNo"
                  label="Docket or tracking no."
                  rules={[{ required: !!modeValue && LETTER_TRACKED_MODES.includes(modeValue), whitespace: true, message: 'Enter the tracking number from the receipt' }]}
                >
                  <Input maxLength={60} placeholder="EO481236957IN" />
                </Form.Item>
                <Form.Item name="dispatchedOn" label="Dispatched on" rules={[{ required: true, message: 'Pick the day it went' }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item name="deliveredOn" label="Delivered on">
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                </Form.Item>
              </FormGrid>
              <Form.Item name="deliveryProof" label="Proof of delivery">
                <Input maxLength={300} placeholder="Acknowledged copy signed by the EE office" />
              </Form.Item>
              <Form.Item name="files" label="Receipt or acknowledged copy">
                <PhotoUpload />
              </Form.Item>
            </>
          ) : null}
        </Form>
      </FormShell>
      {data ? <LetterForm open={editing} onClose={() => setEditing(false)} direction={data.direction} letter={data} /> : null}
      <LetterForm open={!!reply} onClose={() => setReply(null)} direction="OUT" prefill={reply} />
      {deleteDialog}
    </RecordFrame>
  );
}

export function LetterDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <LetterRecord mode="drawer" {...props} />;
}
