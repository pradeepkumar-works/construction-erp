'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Alert, Button, DatePicker, Descriptions, Divider, Drawer, Dropdown, Form, Input, Skeleton, Space, Typography } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, MessageOutlined, MoreOutlined } from '@/components/common/icons';
import dayjs from 'dayjs';
import type { RfiDto } from '@erp/shared';
import { canApprove, canManageVariations, canRaiseRfi, canRaiseRisk } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useCloseRfi, useDeleteRfi, useLinkRfi, useRecordRfiAnswer, useRfi, useWithdrawRfi } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { VariationFormModal } from '@/components/variations/VariationFormModal';
import { RiskFormModal } from '@/components/risks/RiskFormModal';
import { RfiFormModal } from './RfiFormModal';
import { RfiStatusTag, UrgentTag, ageText } from './rfiUi';

/** Record an answer received by letter, mail or at a meeting. */
function AnswerModal({ rfi, open, onClose }: { rfi: RfiDto; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ answer: string; answeredOn: dayjs.Dayjs; answeredByName: string; answerRef?: string }>();
  const { message } = App.useApp();
  const save = useRecordRfiAnswer();
  useEffect(() => {
    if (open) form.setFieldsValue({ answer: rfi.answer ?? undefined, answeredOn: rfi.answeredOn ? dayjs(rfi.answeredOn) : dayjs(), answeredByName: rfi.answeredInPortal ? undefined : (rfi.answeredByName ?? rfi.toParty), answerRef: rfi.answerRef ?? undefined });
  }, [open, rfi, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={620}
      title={`Answer to ${rfi.rfiNo}`}
      okText="Save answer"
      onSubmit={async (v) => {
        await save.mutateAsync({ id: rfi.id, answer: v.answer.trim(), answeredOn: v.answeredOn.format('YYYY-MM-DD'), answeredByName: v.answeredByName.trim(), answerRef: v.answerRef?.trim() || null });
        message.success(`Answer to ${rfi.rfiNo} saved`);
      }}
    >
      <Typography.Paragraph type="secondary">For an answer that came by letter, mail or at a meeting. The client&apos;s engineer can also answer in their portal.</Typography.Paragraph>
      <Form form={form} layout="vertical">
        <Form.Item name="answer" label="Answer" rules={[{ required: true, whitespace: true, message: 'Write the answer as given' }]}>
          <Input.TextArea rows={4} maxLength={4000} showCount />
        </Form.Item>
        <FormGrid>
          <Form.Item name="answeredByName" label="Answered by" rules={[{ required: true, whitespace: true, message: 'Say who answered' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="answeredOn" label="Answered on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || d.isBefore(dayjs(rfi.raisedOn), 'day')} />
          </Form.Item>
        </FormGrid>
        <Form.Item name="answerRef" label="Their letter or mail reference">
          <Input maxLength={100} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** Close an answered RFI once acted on, or withdraw one no longer needed. */
function CloseModal({ rfi, mode, onClose }: { rfi: RfiDto; mode: 'close' | 'withdraw' | null; onClose: () => void }) {
  const [form] = Form.useForm<{ on: dayjs.Dayjs; note?: string }>();
  const { message } = App.useApp();
  const close = useCloseRfi();
  const withdraw = useWithdrawRfi();
  useEffect(() => {
    if (mode) form.setFieldsValue({ on: dayjs(), note: undefined });
  }, [mode, form]);
  const closing = mode === 'close';
  return (
    <FormShell
      open={!!mode}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      title={closing ? `Close ${rfi.rfiNo}` : `Withdraw ${rfi.rfiNo}`}
      okText={closing ? 'Close RFI' : 'Withdraw'}
      onSubmit={async (v) => {
        if (closing) await close.mutateAsync({ id: rfi.id, on: v.on.format('YYYY-MM-DD'), note: v.note?.trim() || null });
        else await withdraw.mutateAsync({ id: rfi.id, note: v.note!.trim() });
        message.success(`${rfi.rfiNo} ${closing ? 'closed' : 'withdrawn'}`);
      }}
    >
      <Form form={form} layout="vertical">
        {closing ? (
          <Form.Item name="on" label="Closed on" rules={[{ required: true, message: 'Pick the date' }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day') || (!!rfi.answeredOn && d.isBefore(dayjs(rfi.answeredOn), 'day'))} />
          </Form.Item>
        ) : null}
        <Form.Item name="note" label={closing ? 'What was done' : 'Why it is withdrawn'} rules={closing ? [] : [{ required: true, whitespace: true, message: 'Say why it is no longer needed' }]}>
          <Input.TextArea rows={2} maxLength={1000} placeholder={closing ? 'e.g. Footing cast at -1.50 m as answered' : 'e.g. Resolved at the site meeting'} />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** One RFI: the question, the answer, what it led to, and the actions its stage allows. */
export function RfiDrawer({ id, open, onClose }: { id: string | null; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useRfi(id ?? undefined);
  const remove = useDeleteRfi();
  const link = useLinkRfi();
  const [editing, setEditing] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [closeMode, setCloseMode] = useState<'close' | 'withdraw' | null>(null);
  const [variationOpen, setVariationOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);

  const role = user?.roleKey;
  const owner = !!user && !!data && (data.raisedById === user.id || canApprove(user.roleKey));
  const mayAnswer = !!role && canRaiseRfi(role);
  const open_ = data?.status === 'OPEN';
  const answered = data?.status === 'ANSWERED';
  const followUps = data && (answered || data.status === 'CLOSED');
  const more = data
    ? [
        ...(followUps && !data.variationId && role && canManageVariations(role) ? [{ key: 'variation', label: 'Raise a variation from the answer' }] : []),
        ...(followUps && !data.riskId && role && canRaiseRisk(role) ? [{ key: 'delay', label: 'Record a delay from the answer' }] : []),
        ...(answered && mayAnswer ? [{ key: 'reanswer', label: 'Correct the answer' }] : []),
        ...(open_ && owner ? [{ key: 'withdraw', label: 'Withdraw' }] : []),
      ]
    : [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={720}
      destroyOnHidden
      title={
        data ? (
          <Space size={8} wrap>
            <span translate="no">{data.rfiNo}</span>
            <RfiStatusTag status={data.status} age={data.age} />
            <UrgentTag priority={data.priority} />
          </Space>
        ) : (
          'RFI'
        )
      }
      extra={
        data ? (
          <Space>
            {open_ && mayAnswer ? (
              <Button size="small" type="primary" icon={<MessageOutlined />} onClick={() => setAnswering(true)}>
                Record answer
              </Button>
            ) : null}
            {answered && owner ? (
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setCloseMode('close')}>
                Close RFI
              </Button>
            ) : null}
            {open_ && owner ? <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Change RFI" /> : null}
            {open_ && owner ? (
              <ConfirmDelete what={`RFI ${data.rfiNo}`} description="Only for an RFI raised by mistake. To stop waiting for an answer, withdraw it instead." onConfirm={() => remove.mutateAsync(data.id)} onDone={onClose}>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete RFI" />
              </ConfirmDelete>
            ) : null}
            {more.length ? (
              <Dropdown
                trigger={['click']}
                menu={{
                  items: more,
                  onClick: ({ key }) => {
                    if (key === 'variation') setVariationOpen(true);
                    if (key === 'delay') setDelayOpen(true);
                    if (key === 'reanswer') setAnswering(true);
                    if (key === 'withdraw') setCloseMode('withdraw');
                  },
                }}
              >
                <Button size="small" icon={<MoreOutlined />} aria-label="More actions" />
              </Dropdown>
            ) : null}
          </Space>
        ) : null
      }
    >
      {isLoading && <Skeleton active />}
      {error && <QueryError error={error} onRetry={() => refetch()} />}
      {data && (
        <>
          {data.status === 'OPEN' && data.age.overdue ? (
            <Alert type="error" showIcon style={{ marginBottom: 12 }} title={`The answer was due on ${formatDate(data.replyBy)}`} description={`Waiting ${data.age.daysOpen} days. Chase ${data.toParty}, or record the answer if it came by letter.`} />
          ) : null}
          {answered && owner ? (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Answered: act on it, then close the RFI" description={data.costImpact || data.timeImpact ? 'If the answer changes the work, raise a variation or record a delay from the More menu.' : undefined} />
          ) : null}
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {data.subject}
          </Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.question}</Typography.Paragraph>
          {data.proposal ? (
            <Typography.Paragraph>
              <Typography.Text type="secondary">Our proposal: </Typography.Text>
              <span style={{ whiteSpace: 'pre-wrap' }}>{data.proposal}</span>
            </Typography.Paragraph>
          ) : null}
          <Descriptions
            size="small"
            column={2}
            bordered
            items={[
              { key: 'project', label: 'Project', span: 2, children: data.projectName },
              { key: 'to', label: 'To', span: 2, children: data.toParty },
              { key: 'raised', label: 'Raised', children: `${formatDate(data.raisedOn)} by ${data.raisedByName}` },
              { key: 'due', label: 'Answer needed by', children: <span className={data.age.overdue ? 'text-danger' : undefined}>{formatDate(data.replyBy)}</span> },
              ...(data.location ? [{ key: 'loc', label: 'Location', span: 2, children: data.location }] : []),
              ...(data.documentLabel ? [{ key: 'doc', label: 'Drawing', span: 2, children: <Link href={`/documents?id=${data.documentId}`}>{data.documentLabel}</Link> }] : []),
              ...(data.boqItemLabel ? [{ key: 'boq', label: 'BOQ item', span: 2, children: data.boqItemLabel }] : []),
              ...(data.costImpact || data.timeImpact ? [{ key: 'impact', label: 'May change', span: 2, children: [data.costImpact ? 'Cost' : null, data.timeImpact ? 'Time' : null].filter(Boolean).join(' and ') }] : []),
            ]}
          />

          <Divider titlePlacement="start" plain>
            Answer
          </Divider>
          {data.answer ? (
            <>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{data.answer}</Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {data.answeredByName}
                {data.answeredInPortal ? ' in the client portal' : ''}, {formatDate(data.answeredOn)}
                {data.answerRef ? ` · ref. ${data.answerRef}` : ''} · {ageText(data.status, data.age)}
              </Typography.Paragraph>
            </>
          ) : (
            <Typography.Paragraph type="secondary">{data.status === 'WITHDRAWN' ? 'Withdrawn before an answer.' : `Not answered yet. ${ageText(data.status, data.age)}.`}</Typography.Paragraph>
          )}
          {data.closedOn ? (
            <Typography.Paragraph type="secondary">
              {data.status === 'WITHDRAWN' ? 'Withdrawn' : 'Closed'} on {formatDate(data.closedOn)}
              {data.closeNote ? `: ${data.closeNote}` : ''}
            </Typography.Paragraph>
          ) : null}

          {data.variationId || data.riskId ? (
            <>
              <Divider titlePlacement="start" plain>
                Led to
              </Divider>
              <Space orientation="vertical" size={4}>
                {data.variationId ? (
                  <Space>
                    <Link href={`/variations?id=${data.variationId}`}>Variation {data.variationLabel}</Link>
                    {mayAnswer ? (
                      <Button size="small" type="link" onClick={() => link.mutateAsync({ id: data.id, variationId: null }).then(() => message.success('Variation unlinked'))}>
                        Unlink
                      </Button>
                    ) : null}
                  </Space>
                ) : null}
                {data.riskId ? (
                  <Space>
                    <Link href={`/risks?id=${data.riskId}`}>{data.riskNo}</Link>
                    {mayAnswer ? (
                      <Button size="small" type="link" onClick={() => link.mutateAsync({ id: data.id, riskId: null }).then(() => message.success('Delay unlinked'))}>
                        Unlink
                      </Button>
                    ) : null}
                  </Space>
                ) : null}
              </Space>
            </>
          ) : null}

          <Divider titlePlacement="start" plain>
            Photos and drawings ({data.attachments.length})
          </Divider>
          <AttachmentGallery attachments={data.attachments} />

          <RfiFormModal open={editing} onClose={() => setEditing(false)} rfi={data} />
          <AnswerModal rfi={data} open={answering} onClose={() => setAnswering(false)} />
          <CloseModal rfi={data} mode={closeMode} onClose={() => setCloseMode(null)} />
          <VariationFormModal
            open={variationOpen}
            onClose={() => setVariationOpen(false)}
            projectId={data.projectId}
            prefill={{ title: data.subject, cause: 'CLIENT_INSTRUCTION', description: `From ${data.rfiNo}. ${data.answer ?? ''}`.trim() }}
            onSaved={(v) => link.mutateAsync({ id: data.id, variationId: v.id }).then(() => message.success(`${v.label} linked to ${data.rfiNo}`))}
          />
          <RiskFormModal
            open={delayOpen}
            onClose={() => setDelayOpen(false)}
            projectId={data.projectId}
            prefill={{ projectId: data.projectId, kind: 'DELAY', title: data.subject, description: `From ${data.rfiNo}: ${data.question}${data.answer ? `\nAnswer: ${data.answer}` : ''}`, category: 'DESIGN' }}
            onSaved={(r) => link.mutateAsync({ id: data.id, riskId: r.id }).then(() => message.success(`${r.riskNo} linked to ${data.rfiNo}`))}
          />
        </>
      )}
    </Drawer>
  );
}
