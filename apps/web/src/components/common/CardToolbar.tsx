'use client';

import React from 'react';
import { Flex } from 'antd';
import type { FlexProps } from 'antd';
import { tk } from '@/ds';

/**
 * The strip across the top of a list card, above its table: filters and actions (`toolbar`), or a row of
 * summary figures (`summary`, with wider side padding). The line under it is the theme's secondary border.
 */
export function CardToolbar({ variant = 'toolbar', style, ...props }: FlexProps & { variant?: 'toolbar' | 'summary' }) {
  return (
    <Flex
      {...props}
      style={{
        padding: variant === 'summary' ? `${tk.space[3]} ${tk.space[4]}` : tk.space[3],
        borderBottom: tk.line('hairline'),
        ...style,
      }}
    />
  );
}
