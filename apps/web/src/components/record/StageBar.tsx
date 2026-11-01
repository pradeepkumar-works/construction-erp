'use client';

import React from 'react';
import { tk } from '@/ds';

/** One stage: its name, and when or by whom (or what it waits for) under it. */
export interface Stage {
  title: React.ReactNode;
  content?: React.ReactNode;
}

export interface StageBarProps {
  /** The stage the entry is at (0-based). Stages before it are done. */
  current: number;
  /**
   * How the current stage stands: in hand with us (`process`), waiting on someone else's decision or reply (`wait`),
   * finished (every stage done), or stopped there (rejected, sent back).
   */
  status?: 'process' | 'wait' | 'finish' | 'error';
  items: Stage[];
  /** What the list is, for a screen reader. */
  label?: string;
  style?: React.CSSProperties;
}

type Place = 'done' | 'inHand' | 'waiting' | 'stopped' | 'toCome';

const SAID: Record<Place, string> = { done: 'done', inHand: 'current stage', waiting: 'current stage, waiting', stopped: 'stopped here', toCome: 'to come' };

/** The stage's line: done is solid, the current one half drawn (in hand) or in its tone, what is to come the track. */
function line(place: Place): string {
  if (place === 'done') return tk.color.accent.solid;
  if (place === 'inHand') return `linear-gradient(to right, ${tk.color.accent.solid} 50%, ${tk.color.state.track} 50%)`;
  if (place === 'waiting') return tk.color.tone.pending.solid;
  if (place === 'stopped') return tk.color.tone.danger.solid;
  return tk.color.state.track;
}

const TITLE: Record<Place, string> = {
  done: tk.color.text.base,
  inHand: tk.color.text.strong,
  waiting: tk.color.tone.pending.fg,
  stopped: tk.color.tone.danger.fg,
  toCome: tk.color.text.muted,
};

/**
 * Where an entry stands (a record's lifecycle, an import's steps), drawn on the brand's datum line: each stage is a 3 px
 * line with its name and detail under it. Done stages are a solid line; the current stage is half drawn while it is in
 * hand, amber while it waits on someone, and red where the entry stopped (rejected, sent back); what is still to come is
 * the track with quiet text. The stages wrap onto a second row on a narrow screen rather than squeezing.
 */
export function StageBar({ current, status = 'process', items, label = 'Stages', style }: StageBarProps) {
  return (
    <ol
      aria-label={label}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
        gap: `${tk.space[3]} ${tk.space[2]}`,
        ...style,
      }}
    >
      {items.map((item, i) => {
        const here = i === current && status !== 'finish';
        const place: Place =
          i < current || (i === current && status === 'finish') ? 'done'
          : !here ? 'toCome'
          : status === 'error' ? 'stopped'
          : status === 'wait' ? 'waiting'
          : 'inHand';
        return (
          <li key={i} aria-current={here ? 'step' : undefined} style={{ display: 'grid', alignContent: 'start', gap: tk.space[1], minWidth: 0 }}>
            <span aria-hidden style={{ display: 'block', height: 3, borderRadius: tk.radius.xs, background: line(place), marginBottom: tk.space[1] }} />
            <span style={{ ...(here ? tk.type.strong : tk.type.body), color: TITLE[place] }}>
              {item.title}
              <span className="visually-hidden">, {SAID[place]}</span>
            </span>
            {item.content ? <span style={{ ...tk.type.caption, color: here && place !== 'stopped' ? TITLE[place] : tk.color.text.muted }}>{item.content}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
