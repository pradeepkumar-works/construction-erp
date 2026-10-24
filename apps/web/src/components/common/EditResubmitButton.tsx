'use client';

import React from 'react';
import { Button, Tooltip } from 'antd';
import { EditOutlined } from '@/components/common/icons';
import type { SubmissionBase } from '@erp/shared';
import { canEditSubmission, canResubmit } from '@erp/shared';
import { useAuth } from '@/lib/auth';

/** Label for the edit / resubmit action, by the entry's current status. */
export function editActionLabel(status: SubmissionBase['status']) {
  return status === 'DRAFT' ? 'Edit and submit' : 'Edit and resubmit';
}

/**
 * "Edit and resubmit" for the author of a rejected / changes-requested entry (or an approver).
 * Renders nothing when the current user cannot resubmit this entry.
 */
export function EditResubmitButton<T extends SubmissionBase>({
  entry,
  onEdit,
  size = 'middle',
  compact = false,
}: {
  entry: T;
  onEdit?: (entry: T) => void;
  size?: 'small' | 'middle' | 'large';
  /** Icon-only button with a tooltip, for table rows. */
  compact?: boolean;
}) {
  const { user } = useAuth();
  if (!user || !onEdit || !canEditSubmission(user, entry) || !canResubmit(user, entry)) return null;
  const label = editActionLabel(entry.status);
  if (compact) {
    return (
      <Tooltip title={label}>
        <Button size={size} icon={<EditOutlined />} onClick={() => onEdit(entry)} aria-label={label} />
      </Tooltip>
    );
  }
  return (
    <Button type="primary" size={size} icon={<EditOutlined />} onClick={() => onEdit(entry)}>
      {label}
    </Button>
  );
}
