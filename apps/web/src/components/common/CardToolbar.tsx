'use client';

import React from 'react';
import { Flex, theme } from 'antd';
import type { FlexProps } from 'antd';

/**
 * The strip across the top of a list card, above its table: filters and actions (`toolbar`), or a row of
 * summary figures (`summary`, with wider side padding). The line under it is the theme's secondary border.
 */
export function CardToolbar({ variant = 'toolbar', style, ...props }: FlexProps & { variant?: 'toolbar' | 'summary' }) {
  const { token } = theme.useToken();
  return (
    <Flex
      {...props}
      style={{
        padding: variant === 'summary' ? `${token.paddingSM}px ${token.padding}px` : token.paddingSM,
        borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
        ...style,
      }}
    />
  );
}
