'use client';

import React from 'react';
import { Button, Dropdown } from 'antd';
import { DeleteOutlined, EllipsisOutlined, MoreOutlined } from '@/components/common/icons';
import { useConfirmDelete, type DeleteRequest } from '@/components/common/ConfirmDelete';
import type { RecordMenuAction } from './RecordFrame';

type Size = 'small' | 'middle';

/**
 * The ⋯ menu of a record, a drawer or a row that is not a submission (submissions' rows use `RowActions`): what cannot
 * be taken back goes last, after a divider, and is confirmed through `useConfirmDelete`, never one tap beside Edit.
 * `inRow` draws the quiet row button; `label` names it for a screen reader ("Actions for INV-12").
 */
export function MoreActions({ items, size = 'small', label = 'More actions', inRow = false }: { items: RecordMenuAction[]; size?: Size; label?: string; inRow?: boolean }) {
  if (!items.length) return null;
  const danger = items.filter((i) => i.danger);
  const rest = items.filter((i) => !i.danger);
  const entry = (i: RecordMenuAction) => ({ key: i.key, label: i.label, icon: i.icon, danger: i.danger, disabled: i.disabled });
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [...rest.map(entry), ...(rest.length && danger.length ? [{ type: 'divider' as const }] : []), ...danger.map(entry)],
        onClick: ({ key }) => items.find((i) => i.key === key)?.onSelect(),
      }}
    >
      {inRow ? <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={label} /> : <Button size={size} icon={<MoreOutlined />} aria-label={label} />}
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
