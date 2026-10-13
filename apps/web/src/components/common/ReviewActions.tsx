'use client';

import React, { useState } from 'react';
import { App, Button, Form, Input, Modal, Space, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import type { ReviewDecision, SubmissionStatus, SubmissionType } from '@erp/shared';
import { mayApproveType } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { useReview, type ApprovalTypeParam } from '@/lib/queries';

const LABELS: Record<ReviewDecision, string> = {
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
  const { message } = App.useApp();
  const review = useReview();
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [form] = Form.useForm<{ note?: string }>();

  if (!user || !mayApproveType(user, type.toUpperCase() as SubmissionType, amount) || status !== 'SUBMITTED') return null;

  const submit = async () => {
    if (!decision) return;
    try {
      const values = await form.validateFields();
      await review.mutateAsync({ type, id, decision, note: values.note });
      message.success(
        decision === 'APPROVE' ? 'Approved' : decision === 'REJECT' ? 'Rejected' : 'Changes requested',
      );
      setDecision(null);
      form.resetFields();
      onDone?.();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(errorMessage(err));
    }
  };

  return (
    <>
      {compact ? (
        <Space size={4}>
          <Tooltip title="Approve">
            <Button type="primary" size={size} icon={<CheckOutlined />} onClick={() => setDecision('APPROVE')} style={{ background: '#1f9d55' }} aria-label="Approve" />
          </Tooltip>
          <Tooltip title="Request changes">
            <Button size={size} icon={<EditOutlined />} onClick={() => setDecision('REQUEST_CHANGES')} aria-label="Request changes" />
          </Tooltip>
          <Tooltip title="Reject">
            <Button danger size={size} icon={<CloseOutlined />} onClick={() => setDecision('REJECT')} aria-label="Reject" />
          </Tooltip>
        </Space>
      ) : (
        <Space wrap size={size === 'small' ? 4 : 8}>
          <Button type="primary" size={size} icon={<CheckOutlined />} onClick={() => setDecision('APPROVE')} style={{ background: '#1f9d55' }}>
            Approve
          </Button>
          <Button size={size} icon={<EditOutlined />} onClick={() => setDecision('REQUEST_CHANGES')}>
            Request changes
          </Button>
          <Button danger size={size} icon={<CloseOutlined />} onClick={() => setDecision('REJECT')}>
            Reject
          </Button>
        </Space>
      )}
      <Modal
        open={!!decision}
        title={decision ? LABELS[decision] : ''}
        okText={decision ? LABELS[decision] : 'OK'}
        okButtonProps={{ danger: decision === 'REJECT', loading: review.isPending }}
        onOk={submit}
        onCancel={() => {
          setDecision(null);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="note"
            label={decision === 'APPROVE' ? 'Note (optional)' : 'Reason'}
            rules={decision === 'APPROVE' ? [] : [{ required: true, message: 'Please enter a reason' }]}
          >
            <Input.TextArea rows={3} placeholder={decision === 'APPROVE' ? 'Any remarks for the submitter' : 'Explain what needs to change'} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
