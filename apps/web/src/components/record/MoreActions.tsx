'use client';

import React from 'react';
import { Button, Dropdown } from 'antd';
import { DeleteOutlined, MoreOutlined } from '@/components/common/icons';
import { useConfirmDelete, type DeleteRequest } from '@/components/common/ConfirmDelete';
import type { RecordMenuAction } from './RecordFrame';

type Size = 'small' | 'middle';

/** A ⋯ menu for a drawer not yet on RecordFrame: what cannot be taken back sits here, never beside the deciding button. */
export function MoreActions({ items, size = 'small' }: { items: RecordMenuAction[]; size?: Size }) {
  if (!items.length) return null;
  return (
    <Dropdown
      trigger={['click']}
      menu={{ items: items.map((i) => ({ key: i.key, label: i.label, icon: i.icon, danger: i.danger, disabled: i.disabled, onClick: i.onSelect })) }}
    >
      <Button size={size} icon={<MoreOutlined />} aria-label="More actions" />
    </Dropdown>
  );
}

/** The ⋯ menu with only Delete (or Remove) in it, confirmed the way ConfirmDelete confirms. */
export function DeleteInMenu({ size, ...request }: DeleteRequest & { size?: Size }) {
  const [askDelete, dialog] = useConfirmDelete();
  return (
    <>
      <MoreActions size={size} items={[{ key: 'delete', label: request.verb ?? 'Delete', icon: <DeleteOutlined />, danger: true, onSelect: () => askDelete(request) }]} />
      {dialog}
    </>
  );
}
