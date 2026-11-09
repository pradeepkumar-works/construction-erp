'use client';

import React from 'react';
import { Button, Skeleton, Typography } from 'antd';
import { boardColumns, formatInScale, moneyScale, type BoardStage, type MoneyScale } from '@erp/shared';
import { ClearOutlined } from '@/components/common/icons';
import { EmptyLine } from '@/components/common/EmptyArt';
import { BoardView } from '@/components/list/ListViewsOfData';
import { tk } from '@/ds';

/** What a list hands its board: the rows fetched and the table's own states. */
export interface BoardListProps<T> {
  rows: readonly T[];
  /** How many rows the list holds, when that can be more than `rows`. */
  total?: number;
  loading: boolean;
  failed: boolean;
  /** The list frame's `empty`: filters narrowed it to nothing, so it offers Clear filters rather than the New button. */
  empty: { filtered: boolean; clear: () => void };
  emptyText: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** The list frame's filter chips, on the strip above the board as above the table. */
  chips?: React.ReactNode;
}

/**
 * A list's Board view (ARCHITECTURE "Views that fit the data"): its rows laid out by `boardColumns`, with the table's own
 * first-load, failed and empty states, and a note when the list holds more rows than one fetch brings. The column heads
 * read in the board's one scale; a card's money in its column's.
 */
export function PipelineBoard<T>({
  label,
  rows,
  stages,
  stageOf,
  amountOf,
  card,
  rowKey,
  noun,
  loading,
  failed,
  total,
  empty,
  emptyText,
  emptyAction,
  chips,
}: BoardListProps<T> & {
  /** The board's accessible name: "Tenders by stage". */
  label: string;
  stages: readonly BoardStage[];
  stageOf: (row: T) => string | null | undefined;
  amountOf?: (row: T) => string | null | undefined;
  /** A card, given its column's money format. */
  card: (row: T, money: (value: string | number) => string) => React.ReactNode;
  rowKey: (row: T) => string;
  noun: readonly [string, string];
}) {
  const columns = boardColumns(rows, stages, stageOf, amountOf);
  // A card reads in its column's scale, so a small bill beside large ones keeps its figures (₹2.60 L, not ₹0.03 Cr).
  const scaleOf = new Map<T, MoneyScale>();
  for (const c of columns) {
    const scale = moneyScale(c.rows.map((r) => amountOf?.(r)));
    for (const r of c.rows) scaleOf.set(r, scale);
  }
  const onBoard = columns.some((c) => c.count > 0);

  if (loading && !rows.length)
    return (
      <div role="status" aria-busy="true" aria-label="Loading" style={{ paddingBlock: tk.space[2] }}>
        <Skeleton active title={false} paragraph={{ rows: 6 }} />
      </div>
    );
  if (failed) return <Typography.Text type="secondary">The list could not load. Try again in a moment.</Typography.Text>;
  const more = total !== undefined && total > rows.length;
  const strip =
    chips || more ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tk.space[2], marginBlockEnd: tk.space[2] }}>
        {chips}
        {more ? (
          <p style={{ ...tk.type.caption, color: tk.color.text.muted, margin: 0 }}>
            <span translate="no">{`Showing the first ${rows.length} of ${total} ${noun[1]}`}</span>; narrow the filters to see the rest.
          </p>
        ) : null}
      </div>
    ) : null;
  if (!onBoard) {
    const next = empty.filtered ? (
      <Button icon={<ClearOutlined />} onClick={empty.clear}>
        Clear filters
      </Button>
    ) : (
      emptyAction
    );
    return (
      <div>
        {strip}
        {emptyText ?? <EmptyLine title="Nothing here yet" />}
        {next ? <div style={{ paddingBlockEnd: tk.space[4] }}>{next}</div> : null}
      </div>
    );
  }
  return (
    <>
      {strip}
      <BoardView label={label} columns={columns} card={(row) => card(row, (v) => formatInScale(v, scaleOf.get(row) ?? 'rupees'))} rowKey={rowKey} noun={noun} />
    </>
  );
}

/** A card on a board: the record's link, a few quiet lines, and its amount beside what waits (a due date, the days at its stage). */
export function BoardCard({ title, lines, amount, aside }: { title: React.ReactNode; lines: React.ReactNode[]; amount?: string | null; aside?: React.ReactNode }) {
  const shown = lines.filter(Boolean);
  return (
    <div style={{ display: 'grid', gap: tk.space[1] }}>
      <div>{title}</div>
      {shown.map((line, i) => (
        <div key={i} style={{ ...tk.type.caption, color: tk.color.text.muted }}>
          {line}
        </div>
      ))}
      {amount || aside ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: tk.space[2] }}>
          <span className="mono" translate="no" style={tk.type.strong}>
            {amount}
          </span>
          {aside ? <div style={tk.type.caption}>{aside}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
