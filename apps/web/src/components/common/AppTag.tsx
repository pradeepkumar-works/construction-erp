'use client';

import React from 'react';
import { Tag } from 'antd';
import type { TagProps } from 'antd';
import { statusTone, type StatusKind, type StatusMeaning, type StatusOf } from '@erp/shared';
import { tk, type Tone } from '@/ds';

/** A record's status, read through the one meaning map (`statusTone` in `@erp/shared`, ARCHITECTURE "Status colour"). */
type StateProps = { [K in StatusKind]: { kind: K; status: StatusOf<K>; meaning?: never; variant?: never } }[StatusKind];
/** A state that is no enum of its own ("Overdue", "Hold point", "3 days late"), said by its meaning. */
type FlagProps = { meaning: StatusMeaning; kind?: never; status?: never; variant?: never };
/** A category rather than a state (a project's type, a voucher's kind, "Own"): outlined, with no dot and no colour. */
type CategoryProps = { variant: 'kind'; kind?: never; status?: never; meaning?: never };

export type AppTagProps = Omit<TagProps, 'color' | 'variant' | 'bordered'> & (StateProps | FlagProps | CategoryProps);

/** The meanings that need someone draw in their tone with a dot; done and closed are quiet text. */
const LOUD: Partial<Record<StatusMeaning, Tone>> = { waiting: 'pending', inHand: 'info', failed: 'danger' };

const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: tk.space[1],
  marginInlineEnd: 0,
  borderRadius: tk.radius.pill,
  fontVariantNumeric: 'tabular-nums',
};

function look(meaning: StatusMeaning | null): React.CSSProperties {
  if (meaning === null) {
    return { ...base, ...tk.type.label, paddingInline: tk.space[2], border: tk.line('base'), background: 'transparent', color: tk.color.text.muted };
  }
  const tone = LOUD[meaning];
  if (!tone) {
    const color = meaning === 'done' ? tk.color.text.base : tk.color.text.muted;
    return { ...base, ...tk.type.body, paddingInline: 0, border: 'none', background: 'transparent', color };
  }
  const t = tk.color.tone[tone];
  return { ...base, ...tk.type.label, paddingInline: tk.space[2], border: 'none', background: t.bg, color: t.fg };
}

/**
 * Every tag in the web app, in one of two forms. A state, `status` of a `kind` (or a `meaning` for a flag): what waits on
 * someone, what is in hand and what failed is a tinted pill with a dot; what is done or closed is plain text, so a column of
 * approved rows stays quiet. A category, `variant="kind"`: an outlined pill in muted ink. Wraps antd `Tag`, so `closable`,
 * `icon` and `onClose` work as before. Scores and counts are not tags: write them as text or a figure.
 */
export function AppTag({ kind, status, meaning, variant, icon, style, children, ...rest }: AppTagProps) {
  const m: StatusMeaning | null = variant === 'kind' ? null : (meaning ?? statusTone(kind as StatusKind, status as never));
  const dot = !icon && m !== null && LOUD[m] !== undefined;
  return (
    <Tag {...rest} icon={icon} variant="filled" style={{ ...look(m), ...style }}>
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flex: 'none' }} />}
      {children}
    </Tag>
  );
}

/** antd's checkable tag (filter chips), which keeps its own look: chosen is the primary fill. */
export const CheckableTag = Tag.CheckableTag;
