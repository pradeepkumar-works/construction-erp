'use client';

import React, { useEffect, useState } from 'react';
import { Alert, App, Button, ConfigProvider, Form, Input, Modal, Space, Tooltip, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@/components/common/icons';
import type { ReviewDecision, SubmissionStatus, SubmissionType } from '@erp/shared';
import { mayApproveType, mayApproveTypeAtAll } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { handledInPlace } from '@/lib/notify';
import { useApprovalStage, usePendingApprovals, useReview, type ApprovalTypeParam } from '@/lib/queries';
import { approveTheme, themeFontSize } from '@/lib/theme';
import { inSentence } from '@/lib/format';

export const REVIEW_LABELS: Record<ReviewDecision, string> = {
  APPROVE: 'Approve',
  REJECT: 'Reject',
  REQUEST_CHANGES: 'Request changes',
};

export function ReviewActions({
  type,
  id,
  status,
  size = 'middle',
  compact = false,
  amount,
  onDone,
}: {
  type: ApprovalTypeParam;
  id: string;
  status: SubmissionStatus;
  size?: 'small' | 'middle' | 'large';
  /** Icon-only buttons with tooltips, for table rows. */
  compact?: boolean;
  /** The amount the approval limit applies to, when the caller knows it (hides the buttons above the user's limit). */
  amount?: string | null;
  onDone?: () => void;
}) {
  const { user } = useAuth();
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const kind = type.toUpperCase() as SubmissionType;
  const could = !!user && status === 'SUBMITTED' && mayApproveTypeAtAll(user, kind);
  // With approval levels the API says whether this user decides the entry at the level it waits at;
  // until it answers, the user's level-1 limit decides, which is the whole answer for a company without levels.
  const { data: stage } = useApprovalStage(type, id, could);
  if (!user || !could || !(stage && stage.status === 'SUBMITTED' ? stage.canReview : mayApproveType(user, kind, amount))) return null;

  return (
    <>
      {compact ? (
        <Space size={4}>
          <ConfigProvider theme={approveTheme}>
            <Tooltip title="Approve">
              <Button type="primary" size={size} icon={<CheckOutlined />} onClick={() => setDecision('APPROVE')} aria-label="Approve" />
            </Tooltip>
          </ConfigProvider>
          <Tooltip title="Request changes">
            <Button size={size} icon={<EditOutlined />} onClick={() => setDecision('REQUEST_CHANGES')} aria-label="Request changes" />
          </Tooltip>
          <Tooltip title="Reject">
            <Button danger size={size} icon={<CloseOutlined />} onClick={() => setDecision('REJECT')} aria-label="Reject" />
          </Tooltip>
        </Space>
      ) : (
        <Space wrap size={size === 'small' ? 4 : 8}>
          <ConfigProvider theme={approveTheme}>
            <Button type="primary" size={size} icon={<CheckOutlined />} onClick={() => setDecision('APPROVE')}>
              Approve
            </Button>
          </ConfigProvider>
          <Button size={size} icon={<EditOutlined />} onClick={() => setDecision('REQUEST_CHANGES')}>
            Request changes
          </Button>
          <Button danger size={size} icon={<CloseOutlined />} onClick={() => setDecision('REJECT')}>
            Reject
          </Button>
        </Space>
      )}
      <ReviewDialog type={type} id={id} decision={decision} onClose={() => setDecision(null)} onDone={onDone} />
    </>
  );
}

/**
 * Whether this user may approve, reject or send back this entry now: it is in their Approvals queue, which knows the
 * level it waits at and escalation; until the queue has loaded, their level-1 limit decides.
 */
export function useMayReview(type: ApprovalTypeParam, status: SubmissionStatus, amount: string | null | undefined, id: string) {
  const { user } = useAuth();
  const kind = type.toUpperCase() as SubmissionType;
  const could = !!user && status === 'SUBMITTED' && mayApproveTypeAtAll(user, kind);
  const { data: queue } = usePendingApprovals(could);
  if (!user || !could) return false;
  return queue ? queue.some((p) => p.type === kind && p.id === id) : mayApproveType(user, kind, amount);
}

/** Fewest characters a reason to reject or send back may have (the API and the phone ask the same). */
const MIN_REASON = 5;
const REASON_MESSAGE: Partial<Record<ReviewDecision, string>> = {
  REJECT: 'Say why you are rejecting it',
  REQUEST_CHANGES: 'Say what needs changing',
};

/** The note dialog behind Approve, Request changes and Reject (a reason of a few words is required for the last two). */
export function ReviewDialog({ type, id, decision, onClose, onDone }: { type: ApprovalTypeParam; id: string; decision: ReviewDecision | null; onClose: () => void; onDone?: () => void }) {
  const { message } = App.useApp();
  const review = useReview();
  const [form] = Form.useForm<{ note?: string }>();
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // The entry the dialog was opened for: in the inbox the picked entry moves on as soon as a decision shows.
  const [forId, setForId] = useState(id);
  useEffect(() => {
    if (decision) setForId(id);
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a decision is picked: in the inbox `id` moves on as soon as one shows
  }, [decision]);

  const submit = async () => {
    if (!decision) return;
    let values: { note?: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const vars = { type, id: forId, decision, note: values.note };
    if (decision === 'APPROVE') {
      // Shown as approved at once; a refusal puts it back and says why, with Retry.
      form.resetFields();
      onClose();
      onDone?.();
      review.mutateAsync(vars).then(
        (r) => message.success(r.status === 'SUBMITTED' && r.levels > 1 ? `Approved level ${r.level} of ${r.levels}. It goes to level ${r.level + 1} next.` : 'Approved'),
        () => undefined,
      );
      return;
    }
    // Sending back or rejecting waits for the server, with the reason kept here if it fails.
    setSending(true);
    setProblem(null);
    try {
      await handledInPlace(() => review.mutateAsync(vars));
      message.success(decision === 'REJECT' ? 'Rejected' : 'Changes requested');
      form.resetFields();
      onClose();
      onDone?.();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!decision}
      title={decision ? REVIEW_LABELS[decision] : ''}
      okText={decision ? REVIEW_LABELS[decision] : 'OK'}
      okButtonProps={{ danger: decision === 'REJECT', loading: sending }}
      onOk={submit}
      onCancel={() => {
        onClose();
        form.resetFields();
      }}
      destroyOnHidden
    >
      {problem ? <Alert type="error" showIcon role="alert" title={problem} style={{ marginTop: 12 }} /> : null}
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item
          name="note"
          label={decision === 'APPROVE' ? 'Note (optional)' : 'Reason'}
          rules={
            decision && decision !== 'APPROVE'
              ? [
                  { required: true, whitespace: true, message: REASON_MESSAGE[decision] },
                  { validator: (_, v?: string) => ((v ?? '').trim().length >= MIN_REASON || !(v ?? '').trim() ? Promise.resolve() : Promise.reject(new Error(`${REASON_MESSAGE[decision]} in a few words`))) },
                ]
              : []
          }
        >
          <Input.TextArea
            rows={3}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks
            autoFocus
            placeholder={decision === 'APPROVE' ? 'Any remarks for the submitter' : decision === 'REJECT' ? 'Why it cannot be approved' : 'Explain what needs to change'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        Ctrl Enter to {decision ? inSentence(REVIEW_LABELS[decision]) : 'confirm'}
      </Typography.Text>
    </Modal>
  );
}
