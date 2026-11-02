'use client';

import React from 'react';
import { Flex } from 'antd';
import { tk } from '@/ds';

/** A Listy row's avatar, title and description (what List.Item.Meta drew before antd 6 deprecated List). */
export function ListRowMeta({ avatar, title, description }: { avatar?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <Flex gap={tk.space[4]} align="flex-start" flex="auto" style={{ minWidth: 0 }}>
      {avatar ? <div style={{ flex: 'none' }}>{avatar}</div> : null}
      <div style={{ flex: 'auto', minWidth: 0 }}>
        <div style={{ color: tk.color.text.base, marginBottom: description ? tk.space[1] : 0 }}>{title}</div>
        {description ? <div style={{ color: tk.color.text.faint }}>{description}</div> : null}
      </div>
    </Flex>
  );
}
