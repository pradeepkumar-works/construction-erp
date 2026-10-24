'use client';

import React from 'react';
import { Tag, theme } from 'antd';
import type { TagProps } from 'antd';
import { useAppearance } from '@/lib/appearance';
import { BRAND } from '@/lib/brand';

/**
 * What a tag says, by meaning rather than colour (brand guide: status colour is never decoration). `pending` waits on
 * someone, `success` is done or approved, `danger` is rejected, overdue or lost, `info` is planned or in hand, `violet` is a
 * state that is none of these (changes requested, completed), and `neutral` is a draft or a plain label.
 */
export type TagTone = 'neutral' | 'info' | 'pending' | 'success' | 'danger' | 'violet';

/** antd's preset colour names, which the colour maps in `lib/format.ts` and the pages still use, as tones. */
const TONE_OF_COLOR: Record<string, TagTone> = {
  default: 'neutral',
  blue: 'info',
  geekblue: 'info',
  cyan: 'info',
  processing: 'info',
  orange: 'pending',
  gold: 'pending',
  yellow: 'pending',
  volcano: 'pending',
  warning: 'pending',
  green: 'success',
  lime: 'success',
  success: 'success',
  red: 'danger',
  magenta: 'danger',
  pink: 'danger',
  error: 'danger',
  purple: 'violet',
};

/** The tone for an antd colour name; anything else (undefined, a hex) is neutral. */
export const toneOf = (color: string | undefined | null): TagTone => (color && TONE_OF_COLOR[color]) || 'neutral';

const c = BRAND.colors;

/** Each tone's text and fill, in either theme (every pair keeps 4.5:1). */
export function toneColors(tone: TagTone, dark: boolean): { fg: string; bg: string } {
  switch (tone) {
    case 'info':
      return dark ? { fg: c.nightLink, bg: c.nightToneInfoBg } : { fg: c.link, bg: c.accentSoft };
    case 'pending':
      return dark ? { fg: c.nightPending, bg: c.nightTonePendingBg } : { fg: c.pending, bg: c.pendingBg };
    case 'success':
      return dark ? { fg: c.nightSuccess, bg: c.nightToneSuccessBg } : { fg: c.success, bg: c.successBg };
    case 'danger':
      return dark ? { fg: c.nightDanger, bg: c.nightToneDangerBg } : { fg: c.danger, bg: c.dangerBg };
    case 'violet':
      return dark ? { fg: c.nightViolet, bg: c.nightToneVioletBg } : { fg: c.violet, bg: c.violetBg };
    default:
      return dark ? { fg: c.nightNeutralText, bg: c.nightNeutralBg } : { fg: c.muted, bg: c.neutralBg };
  }
}

export interface AppTagProps extends Omit<TagProps, 'color' | 'bordered'> {
  /** What the tag means. */
  tone?: TagTone;
  /** An antd colour name from one of the colour maps, read as its tone. Prefer `tone` in new code. */
  color?: string;
  /** A dot before the words, so a status does not rest on colour alone. On by default for every tone but `neutral`. */
  dot?: boolean;
}

/**
 * Every tag in the web app: a pill in its tone's soft fill, no outline, semibold, with a dot for a status. `variant="outlined"`
 * draws the tone as an outline on no fill instead, for a kind rather than a state (a project's type). Wraps antd `Tag`, so
 * `closable`, `icon` and `onClose` work as before.
 */
export function AppTag({ tone, color, dot, variant, icon, style, children, ...rest }: AppTagProps) {
  const { token } = theme.useToken();
  const { dark } = useAppearance();
  const t = tone ?? toneOf(color);
  const { fg, bg } = toneColors(t, dark);
  const outlined = variant === 'outlined';
  const showDot = !icon && (dot ?? t !== 'neutral');
  return (
    <Tag
      {...rest}
      icon={icon}
      variant="filled"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: token.marginXXS + 2,
        marginInlineEnd: 0,
        paddingInline: showDot ? `${token.paddingXS - 1}px ${token.paddingXS + 2}px` : token.paddingXS + 2,
        borderRadius: 999,
        border: `${token.lineWidth}px solid ${outlined ? fg : 'transparent'}`,
        background: outlined ? 'transparent' : bg,
        color: fg,
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {showDot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flex: 'none' }} />}
      {children}
    </Tag>
  );
}

/** antd's checkable tag (filter chips), which keeps its own look: chosen is the primary fill. */
export const CheckableTag = Tag.CheckableTag;
