'use client';

import React, { useState } from 'react';
import { App, Button, ConfigProvider, Form, Input, Modal, Space, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import type { ReviewDecision, SubmissionStatus, SubmissionType } from '@erp/shared';
import { mayApproveType } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useReview, type ApprovalTypeParam } from '@/lib/queries';
import { approveTheme } from '@/lib/theme';

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

  if (!user || !mayApproveType(user, type.toUpperCase() as SubmissionType, amount) || status !== 'SUBMITTED') return null;

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

/** Whether this user may approve, reject or send back this entry now. */
export function useMayReview(type: ApprovalTypeParam, status: SubmissionStatus, amount?: string | null) {
  const { user } = useAuth();
  return !!user && status === 'SUBMITTED' && mayApproveType(user, type.toUpperCase() as SubmissionType, amount);
}

/** The note dialog behind Approve, Request changes and Reject (a reason is required for the last two). */
export function ReviewDialog({ type, id, decision, onClose, onDone }: { type: ApprovalTypeParam; id: string; decision: ReviewDecision | null; onClose: () => void; onDone?: () => void }) {
  const { message } = App.useApp();
  const review = useReview();
  const [form] = Form.useForm<{ note?: string }>();

  const submit = async () => {
    if (!decision) return;
    try {
      const values = await form.validateFields();
      await review.mutateAsync({ type, id, decision, note: values.note });
      message.success(decision === 'APPROVE' ? 'Approved' : decision === 'REJECT' ? 'Rejected' : 'Changes requested');
      form.resetFields();
      onClose();
      onDone?.();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={!!decision}
      title={decision ? REVIEW_LABELS[decision] : ''}
      okText={decision ? REVIEW_LABELS[decision] : 'OK'}
      okButtonProps={{ danger: decision === 'REJECT', loading: review.isPending }}
      onOk={submit}
      onCancel={() => {
        onClose();
        form.resetFields();
      }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Form.Item name="note" label={decision === 'APPROVE' ? 'Note (optional)' : 'Reason'} rules={decision === 'APPROVE' ? [] : [{ required: true, message: 'Please enter a reason' }]}>
          <Input.TextArea rows={3} placeholder={decision === 'APPROVE' ? 'Any remarks for the submitter' : 'Explain what needs to change'} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
