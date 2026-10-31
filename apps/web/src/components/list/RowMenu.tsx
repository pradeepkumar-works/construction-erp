'use client';

import React from 'react';
import { Button, Dropdown } from 'antd';
import { EllipsisOutlined } from '@/components/common/icons';

export interface RowMenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * The ⋯ menu of a row that is not a submission (a receipt, a payment, a master entry): Edit and the like, with Delete
 * last through `useConfirmDelete`, so it is never one tap beside Edit. Submissions use `RowActions`.
 */
export function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  if (!items.length) return null;
  const danger = items.filter((i) => i.danger);
  const rest = items.filter((i) => !i.danger);
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [
          ...rest.map((i) => ({ key: i.key, label: i.label, disabled: i.disabled })),
          ...(rest.length && danger.length ? [{ type: 'divider' as const }] : []),
          ...danger.map((i) => ({ key: i.key, label: i.label, danger: true, disabled: i.disabled })),
        ],
        onClick: ({ key }) => items.find((i) => i.key === key)?.onSelect(),
      }}
    >
      <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={label} />
    </Dropdown>
  );
}
