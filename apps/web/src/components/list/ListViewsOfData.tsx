'use client';

import React from 'react';
import { Segmented, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { LIST_VIEW_LABELS, formatInScale, moneyScale, type BoardColumn, type DayGridRow, type ListViewKind, type StatusMeaning } from '@erp/shared';
import { CarryOutOutlined, CheckOutlined, CloseOutlined, ProjectOutlined, TableOutlined } from '@/components/common/icons';
import { tk } from '@/ds';
import { useIsPhone } from '@/lib/screen';
import { formatDayMonth } from '@/lib/format';
import styles from './ListViewsOfData.module.css';

/**
 * Views that fit the data (ARCHITECTURE "Views that fit the data"): the toggle beside a list's tools, a board of a
 * pipeline's stages with the count and rupees of each, and a grid of sites by days. The pure layouts are `boardColumns`
 * and `dayGrid` in `@erp/shared/list-views.ts`; a page picks the view with `useListFrame({ viewKinds })`.
 */

const ICONS: Record<ListViewKind, React.ReactNode> = {
  table: <TableOutlined />,
  board: <ProjectOutlined />,
  days: <CarryOutOutlined />,
};

/**
 * Table, Board or Days: icon and word, so the choice reads without a tooltip. On a phone it sits beside Filters, so it
 * is the icons alone, each with its word for a screen reader and a hint on a long press.
 */
export function ViewToggle({ kinds, value, onChange }: { kinds: readonly ListViewKind[]; value: ListViewKind; onChange: (v: ListViewKind) => void }) {
  const phone = useIsPhone();
  return (
    <Segmented<ListViewKind>
      aria-label="View"
      value={value}
      onChange={onChange}
      style={{ flexShrink: 0 }}
      options={kinds.map((k) => ({
        value: k,
        icon: ICONS[k],
        title: phone ? LIST_VIEW_LABELS[k] : undefined,
        label: phone ? <span className="visually-hidden">{LIST_VIEW_LABELS[k]}</span> : LIST_VIEW_LABELS[k],
      }))}
    />
  );
}

/** "3 · ₹ 4.20 Cr": a column's count and its rupees in one scale for the whole board. */
function columnSummary(col: BoardColumn<unknown>, scale: ReturnType<typeof moneyScale>, noun: readonly [string, string]) {
  const count = `${col.count} ${col.count === 1 ? noun[0] : noun[1]}`;
  return col.amount === null || col.count === 0 ? count : `${count} · ${formatInScale(col.amount, scale)}`;
}

/**
 * A pipeline as columns of cards, one per stage in order, each headed by how many and how much. On a phone the stages
 * stack, each a group of its cards. A card is the page's own (title, amount, what waits), and opens the record.
 */
export function BoardView<T>({
  label,
  columns,
  card,
  rowKey,
  noun,
  empty = 'Nothing here',
}: {
  /** The board's accessible name: "Tenders by stage". */
  label: string;
  columns: BoardColumn<T>[];
  card: (row: T) => React.ReactNode;
  rowKey: (row: T) => string;
  /** What one card is: ['tender', 'tenders']. */
  noun: readonly [string, string];
  empty?: string;
}) {
  const phone = useIsPhone();
  const scale = moneyScale(columns.map((c) => c.amount));
  return (
    <section aria-label={label} className={phone ? styles.stack : styles.board} data-scroll-region>
      {columns.map((col) => (
        <section key={col.key} aria-label={`${col.label}, ${columnSummary(col, scale, noun)}`} className={styles.column}>
          <header className={styles.head}>
            <span style={tk.type.strong}>{col.label}</span>
            <span className="mono" translate="no" style={{ ...tk.type.caption, color: tk.color.text.muted }}>
              {columnSummary(col, scale, noun)}
            </span>
          </header>
          {col.rows.length ? (
            <ul className={styles.cards}>
              {col.rows.map((row) => (
                <li key={rowKey(row)} className={styles.card}>
                  {card(row)}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.none}>{empty}</p>
          )}
        </section>
      ))}
    </section>
  );
}

/**
 * A day's state as one mark, told apart by shape as well as colour: a tick when it is done, a dot when it waits on
 * someone, a ring while it is in hand, a cross when it failed or was sent back. The cell's button carries the words.
 */
export function DayMark({ meaning }: { meaning: StatusMeaning }) {
  if (meaning === 'done' || meaning === 'closed') return <CheckOutlined aria-hidden style={{ color: meaning === 'done' ? tk.color.text.base : tk.color.text.muted }} />;
  if (meaning === 'failed') return <CloseOutlined aria-hidden style={{ color: tk.color.tone.danger.fg }} />;
  if (meaning === 'inHand') return <span aria-hidden className={styles.ring} style={{ borderColor: tk.color.tone.info.fg }} />;
  return <span aria-hidden className={styles.dot} style={{ background: tk.color.tone.pending.fg }} />;
}

/** One line of a grid's legend: the mark and what it means. */
export interface DayLegendItem {
  key: string;
  mark: React.ReactNode;
  label: string;
}

/**
 * Sites by days, read like a calendar: a row per site, a narrow column per day of equal width with the latest on the
 * right, and a mark in each cell, explained by the legend above. A day with nothing filed is an empty shaded cell, read
 * out as "nothing filed", so a missed day is seen at a glance. When the days do not fit, the grid scrolls in its own box.
 */
export function DayGridView<P, T>({
  label,
  rows,
  days,
  place,
  cell,
  placeKey,
  legend = [],
  missingWord = 'Nothing filed',
}: {
  /** The grid's accessible name: "Daily reports by site and day". */
  label: string;
  rows: DayGridRow<P, T>[];
  days: readonly string[];
  /** The row's head: the site's name, linked. */
  place: (place: P, missing: number) => React.ReactNode;
  cell: (entries: T[], day: string, place: P) => React.ReactNode;
  placeKey: (place: P) => string;
  /** The marks the cells use; the empty cell is added after them. */
  legend?: readonly DayLegendItem[];
  missingWord?: string;
}) {
  return (
    <>
      <ul className={styles.legend} aria-label="Key">
        {legend.map((l) => (
          <li key={l.key}>
            {l.mark}
            {l.label}
          </li>
        ))}
        <li>
          <span aria-hidden className={styles.swatch} />
          {missingWord}
        </li>
      </ul>
      <div className={styles.gridBox} data-scroll-region role="region" aria-label={label}>
        {/* Fixed layout: every day the same width, so the days read as an even line of time, whatever a cell holds. */}
        <table className={styles.grid} style={{ minWidth: `calc(var(--grid-place) + ${days.length} * var(--grid-day))` }}>
          <colgroup>
            <col className={styles.placeCol} />
            {days.map((d) => (
              <col key={d} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.placeHead}>
                Site
                <span className={styles.span} translate="no">
                  {formatDayMonth(days[0])} to {formatDayMonth(days[days.length - 1])}
                </span>
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={styles.dayHead} translate="no">
                  <span className={styles.weekday}>{dayjs(d).format('ddd')}</span>
                  {dayjs(d).format('D')}
                  <span className="visually-hidden"> {dayjs(d).format('MMM')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={placeKey(r.place)}>
                <th scope="row" className={styles.placeCell}>
                  {place(r.place, r.missing)}
                </th>
                {days.map((d) => {
                  const entries = r.cells[d];
                  return (
                    <td key={d} className={entries.length ? undefined : styles.missing}>
                      {entries.length ? cell(entries, d, r.place) : <span className="visually-hidden">{missingWord}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** A plain hover hint on a grid cell; the cell's own words carry the meaning. */
export function CellHint({ title, children }: { title: string; children: React.ReactNode }) {
  return <Tooltip title={title}>{children}</Tooltip>;
}
