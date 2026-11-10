'use client';

import React from 'react';
import { Button, Popover } from 'antd';
import { InfoCircleOutlined } from '@/components/common/icons';
import { tk } from '@/ds';

/**
 * How a page, section or figure works, kept off the screen until asked for: an ⓘ beside the title that opens the
 * words in a popover (docs/WRITING.md "Screen text").
 */
export function Help({ children, label = 'About this' }: { children: React.ReactNode; label?: string }) {
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      content={<div style={{ maxWidth: '42ch', ...tk.type.body, color: tk.color.text.base }}>{children}</div>}
    >
      <Button
        type="text"
        size="small"
        aria-label={label}
        icon={<InfoCircleOutlined />}
        style={{ color: tk.color.text.muted, verticalAlign: 'middle' }}
      />
    </Popover>
  );
}
