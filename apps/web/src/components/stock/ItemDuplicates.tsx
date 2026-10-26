'use client';

import React, { useState } from 'react';
import { App, Button, Card, Checkbox, Drawer, Flex, Radio, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ItemDto, ItemDuplicateGroupDto, ItemMergeEntryDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { EmptyArt } from '@/components/common/EmptyArt';

const uses = (n: number) => (n === 0 ? 'not used yet' : n === 1 ? 'used once' : `used ${n} times`);

function Entry({ e }: { e: ItemMergeEntryDto }) {
  return (
    <span>
      <span translate="no">{e.name}</span> <Typography.Text type="secondary">· {e.unit} · {uses(e.uses)}</Typography.Text>
    </span>
  );
}

/** One group: which item to keep, and which of the others fold into it. */
function Group({ group }: { group: ItemDuplicateGroupDto }) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const all = [group.keep, ...group.merge];
  const [keepId, setKeepId] = useState(group.keep.id);
  const [fromIds, setFromIds] = useState<string[]>(group.merge.map((m) => m.id));
  const keep = all.find((e) => e.id === keepId)!;
  const chosen = fromIds.filter((id) => id !== keepId);

  const merge = useMutation({
    mutationFn: async () => (await api.post<ItemDto>(`/stock/items/${keepId}/merge`, { fromIds: chosen })).data,
    onSuccess: (i) => {
      message.success(`Merged into ${i.name}`);
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['cost'] });
    },
    meta: FAIL_NOTICE,
  });

  const confirm = () =>
    modal.confirm({
      title: `Merge into ${keep.name}?`,
      content: `${all
        .filter((e) => chosen.includes(e.id))
        .map((e) => e.name)
        .join(', ')} will go. Their stock, norms and minimums move to ${keep.name}, and request and order lines take its name. This cannot be undone.`,
      okText: 'Merge',
      onOk: () => merge.mutateAsync(),
    });

  return (
    <Card size="small">
      <Flex vertical gap={8}>
        <Typography.Text strong>Keep</Typography.Text>
        <Radio.Group value={keepId} onChange={(e) => setKeepId(e.target.value)} aria-label="Item to keep">
          <Space orientation="vertical" size={4}>
            {all.map((e) => (
              <Radio key={e.id} value={e.id}>
                <Entry e={e} />
              </Radio>
            ))}
          </Space>
        </Radio.Group>
        <Typography.Text strong>Merge into it</Typography.Text>
        <Checkbox.Group value={chosen} onChange={(v) => setFromIds(v as string[])} aria-label="Items to merge">
          <Space orientation="vertical" size={4}>
            {all
              .filter((e) => e.id !== keepId)
              .map((e) => (
                <Checkbox key={e.id} value={e.id}>
                  <Entry e={e} />
                </Checkbox>
              ))}
          </Space>
        </Checkbox.Group>
        <div>
          <Button type="primary" disabled={!chosen.length} loading={merge.isPending} onClick={confirm}>
            Merge {chosen.length === 1 ? '1 item' : `${chosen.length} items`}
          </Button>
        </div>
      </Flex>
    </Card>
  );
}

/**
 * Items that look like one item written more ways (finding 3 of the October review): the store manager keeps one and
 * folds the others into it once. Their names stay as old names, so a line typed the old way still lands on it.
 */
export function ItemDuplicates({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: ItemDuplicateGroupDto[] }) {
  return (
    <Drawer open={open} onClose={onClose} size={560} destroyOnHidden title="Possible duplicates">
      <Flex vertical gap={12}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          The same unit, and the same name written another way or one name inside the other. Keep the one you want and merge the rest; leave a group alone when they
          are different materials.
        </Typography.Paragraph>
        {groups.length ? groups.map((g) => <Group key={[g.keep.id, ...g.merge.map((m) => m.id)].join()} group={g} />) : <EmptyArt art="approved" title="No duplicates left." />}
      </Flex>
    </Drawer>
  );
}
