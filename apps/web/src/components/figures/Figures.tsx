'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Skeleton } from 'antd';
import { presentFigures, type ContractCurrency, type FigureInput, type FigureScope, type FigureState, type FigureView, type Words } from '@erp/shared';
import { tk } from '@/ds';
import { todayDate } from '@/lib/format';
import styles from './Figures.module.css';

export interface FiguresProps {
  /** The section's accessible name: "Portfolio figures" */
  label: string;
  /** Facts from `figure()`, or the API's `Figure[]` as they came; undefined while loading draws a skeleton */
  figures: readonly FigureInput[] | undefined;
  /** Filters each figure's list link carries */
  scope?: FigureScope;
  currency?: ContractCurrency | null;
  /** Inside a surface already (a tab, a card): no card of its own */
  bare?: boolean;
}

const VALUE_COLOR: Record<FigureState, string> = {
  act: tk.color.tone.danger.fg,
  watch: tk.color.tone.pending.fg,
  calm: tk.color.text.strong,
  quiet: tk.color.text.muted,
};
const NOTE_COLOR: Record<FigureView['noteState'], string> = {
  act: tk.color.tone.danger.fg,
  watch: tk.color.tone.pending.fg,
  calm: tk.color.text.muted,
};

/** Shown words for the eye, spoken words for a screen reader ("Cr" read as "crore", "Sep" as "September"). */
function Say({ w }: { w: Words }) {
  if (w.text === w.spoken) return <>{w.text}</>;
  return (
    <>
      <span aria-hidden="true">{w.text}</span>
      <span className="visually-hidden">{w.spoken}</span>
    </>
  );
}

/** Which inner hairlines a cell draws at one width: `l` when a cell sits to its left, `t` when a row sits above it. */
function hairlines(spans: readonly number[], columns: number): string[] {
  let col = 0;
  let row = 0;
  return spans.map((span) => {
    const mark = [col > 0 ? 'l' : '', row > 0 ? 't' : ''].filter(Boolean).join(' ');
    col += span;
    if (col >= columns) {
      col = 0;
      row++;
    }
    return mark;
  });
}

/**
 * The one headline-figure block (ARCHITECTURE "Headline figures"): the presenter's words, colours, lead and spans drawn
 * as a `dl`, the figure that needs action first and larger, flag figures at zero in one quiet line under it. Colour
 * means "look here" (danger to act, pending to watch, muted for a zero), never good news.
 */
export function Figures({ label, figures, scope, currency, bare }: FiguresProps) {
  const frame = (body: React.ReactNode) => (bare ? body : <Card size="small" styles={{ body: { padding: 0 } }}>{body}</Card>);
  if (!figures) return frame(<Skeleton active title={false} paragraph={{ rows: 2 }} style={{ padding: tk.space[4] }} />);

  const view = presentFigures(figures, { today: todayDate(), scope, currency });
  const cells = view.lead ? [view.lead, ...view.rest] : view.rest;
  if (!cells.length && !view.clear) return null;
  const lines = {
    p: hairlines(cells.map((c) => c.span.phone), view.columns.phone),
    m: hairlines(cells.map((c) => c.span.medium), view.columns.medium),
    w: hairlines(cells.map((c) => c.span.wide), view.columns.wide),
  };

  return frame(
    <section aria-label={label} className={styles.box}>
      {cells.length > 0 && (
        <dl className={styles.grid} style={{ '--fig-cols-p': String(view.columns.phone), '--fig-cols-m': String(view.columns.medium), '--fig-cols-w': String(view.columns.wide) } as React.CSSProperties}>
          {cells.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className={`${styles.cell} figure-cell`}
              data-p={lines.p[i]}
              data-m={lines.m[i]}
              data-w={lines.w[i]}
              style={{ '--fig-span-p': String(c.span.phone), '--fig-span-m': String(c.span.medium), '--fig-span-w': String(c.span.wide) } as React.CSSProperties}
            >
              <dt className={styles.label} style={{ ...tk.type.caption, color: tk.color.text.muted }}>
                {c.href ? (
                  <Link href={c.href} className={styles.link} title={c.define}>
                    <Say w={c.label} />
                  </Link>
                ) : (
                  <Say w={c.label} />
                )}
              </dt>
              <dd className={styles.value} translate="no" style={{ ...(c === view.lead ? tk.type.display : tk.type.figure), color: VALUE_COLOR[c.state] }}>
                {c.machine === null ? (
                  <Say w={c.value} />
                ) : (
                  <data value={c.machine}>
                    <Say w={c.value} />
                  </data>
                )}
              </dd>
              {c.note && (
                <dd className={styles.note} style={{ ...tk.type.caption, color: NOTE_COLOR[c.noteState] }}>
                  <Say w={c.note} />
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {view.clear && (
        <p className={styles.clear} style={tk.type.caption}>
          <Say w={view.clear} />
        </p>
      )}
    </section>,
  );
}
