'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined, EllipsisOutlined, ExpandOutlined, ExportOutlined, RollbackOutlined } from '@/components/common/icons';
import type { ReviewDecision, SubmissionBase } from '@erp/shared';
import { canEditSubmission, canResubmit } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import type { ApprovalTypeParam } from '@/lib/queries';
import { ReviewDialog, useMayReview } from '@/components/common/ReviewActions';
import { editActionLabel } from '@/components/common/EditResubmitButton';
import { usePrefetch } from '@/lib/prefetch';

/**
 * A row's ⋯ menu on a list page: Open (and Open full page), then whatever this user may do to the entry (approve, send back or reject while
 * it waits; edit and resubmit their own when it was sent back), and any list-specific `extra` items.
 */
export function RowActions<T extends SubmissionBase & { id: string }>({
  type,
  row,
  amount,
  href,
  onOpen,
  onEdit,
  extra,
  review = true,
}: {
  type: ApprovalTypeParam;
  row: T;
  /** The amount the approval limit applies to, when the list knows it. */
  amount?: string | null;
  /** The entry's own page, when it has one: "Open full page". */
  href?: string;
  onOpen: (id: string) => void;
  onEdit?: (row: T) => void;
  extra?: MenuProps['items'];
  /** False where the decision needs more than a note (an inspection is passed from its checklist in the record). */
  review?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const prefetch = usePrefetch();
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const mayReview = useMayReview(type, row.status, amount, row.id) && review;
  const mayEdit = !!user && !!onEdit && canEditSubmission(user, row) && canResubmit(user, row);

  const items: MenuProps['items'] = [
    { key: 'open', icon: <ExportOutlined />, label: 'Open', onClick: () => onOpen(row.id) },
    ...(href ? [{ key: 'page', icon: <ExpandOutlined />, label: 'Open full page', onClick: () => router.push(href) }] : []),
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
      {/* Opening the menu fetches the entry ahead (item 83): Open and Open full page then show it at once. */}
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight" onOpenChange={(o) => o && prefetch.record(href)}>
        <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label="Actions" />
      </Dropdown>
      <ReviewDialog type={type} id={row.id} decision={decision} onClose={() => setDecision(null)} />
    </>
  );
}
