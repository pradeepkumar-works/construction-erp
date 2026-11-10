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

/** A card's, modal's or drawer's title with its ⓘ, for a surface that takes a title but no `help` of its own. */
export function TitleHelp({ children, help }: { children: React.ReactNode; help: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: tk.space[1] }}>
      {children}
      <Help>{help}</Help>
    </span>
  );
}

/**
 * The ⓘ for an explanation with no title beside it to sit on (a form's or a panel's opening words): one quiet
 * "How it works" link in the paragraph's place.
 */
export function HelpLink({
  children,
  label = 'How it works',
  style,
}: {
  children: React.ReactNode;
  label?: string;
  /** The paragraph's own spacing, where it sat inside a box with no padding (a table's card). */
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: tk.space[2], ...style, fontSize: undefined }}>
      <Popover
        trigger="click"
        placement="bottomLeft"
        content={<div style={{ maxWidth: '42ch', ...tk.type.body, color: tk.color.text.base }}>{children}</div>}
      >
        <Button type="link" size="small" icon={<InfoCircleOutlined />} style={{ paddingInline: 0, color: tk.color.text.muted }}>
          {label}
        </Button>
      </Popover>
    </div>
  );
}
