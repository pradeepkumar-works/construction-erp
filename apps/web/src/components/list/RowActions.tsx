'use client';

import React, { useState } from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, EllipsisOutlined, ExportOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ReviewDecision, SubmissionBase } from '@erp/shared';
import { canEditSubmission, canResubmit } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import type { ApprovalTypeParam } from '@/lib/queries';
import { ReviewDialog, useMayReview } from '@/components/common/ReviewActions';
import { editActionLabel } from '@/components/common/EditResubmitButton';

/**
 * A row's ⋯ menu on a list page: Open, then whatever this user may do to the entry (approve, send back or reject while
 * it waits; edit and resubmit their own when it was sent back), and any list-specific `extra` items.
 */
export function RowActions<T extends SubmissionBase & { id: string }>({
  type,
  row,
  amount,
  onOpen,
  onEdit,
  extra,
}: {
  type: ApprovalTypeParam;
  row: T;
  /** The amount the approval limit applies to, when the list knows it. */
  amount?: string | null;
  onOpen: (id: string) => void;
  onEdit?: (row: T) => void;
  extra?: MenuProps['items'];
}) {
  const { user } = useAuth();
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const mayReview = useMayReview(type, row.status, amount);
  const mayEdit = !!user && !!onEdit && canEditSubmission(user, row) && canResubmit(user, row);

  const items: MenuProps['items'] = [
    { key: 'open', icon: <ExportOutlined />, label: 'Open', onClick: () => onOpen(row.id) },
    ...(mayReview
      ? [
          { type: 'divider' as const },
          { key: 'approve', icon: <CheckOutlined />, label: 'Approve', onClick: () => setDecision('APPROVE') },
          { key: 'changes', icon: <RollbackOutlined />, label: 'Request changes', onClick: () => setDecision('REQUEST_CHANGES') },
          { key: 'reject', icon: <CloseOutlined />, label: 'Reject', danger: true, onClick: () => setDecision('REJECT') },
        ]
      : []),
    ...(mayEdit ? [{ type: 'divider' as const }, { key: 'edit', icon: <EditOutlined />, label: editActionLabel(row.status), onClick: () => onEdit?.(row) }] : []),
    ...(extra?.length ? [{ type: 'divider' as const }, ...extra] : []),
  ];

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
        <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label="Actions" />
      </Dropdown>
      <ReviewDialog type={type} id={row.id} decision={decision} onClose={() => setDecision(null)} />
    </>
  );
}
