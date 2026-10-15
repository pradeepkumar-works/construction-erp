'use client';

import React from 'react';
import { Flex, theme } from 'antd';

/** A Listy row's avatar, title and description (what List.Item.Meta drew before antd 6 deprecated List). */
export function ListRowMeta({ avatar, title, description }: { avatar?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Flex gap={token.margin} align="flex-start" flex="auto" style={{ minWidth: 0 }}>
      {avatar ? <div style={{ flex: 'none' }}>{avatar}</div> : null}
      <div style={{ flex: 'auto', minWidth: 0 }}>
        <div style={{ color: token.colorText, marginBottom: description ? token.marginXXS : 0 }}>{title}</div>
        {description ? <div style={{ color: token.colorTextDescription }}>{description}</div> : null}
      </div>
    </Flex>
  );
}
