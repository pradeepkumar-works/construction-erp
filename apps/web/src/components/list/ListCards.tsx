'use client';

import React, { useState } from 'react';
import { Checkbox, Pagination, Skeleton, Spin, Typography } from 'antd';
import type { TableProps } from 'antd';
import { RecordLink } from '@/components/record/RecordLink';
import { usePrefetch } from '@/lib/prefetch';
import type { ListColumn } from './DataTable';

/** What a column is on a phone's card: its name, its status tag, the amount, the date, or part of the line under the name. */
export type CardRole = 'title' | 'status' | 'amount' | 'date' | 'meta';

export interface CardFields<T> {
  title: ListColumn<T> | undefined;
  status?: ListColumn<T>;
  amount?: ListColumn<T>;
  date?: ListColumn<T>;
  meta: ListColumn<T>[];
}

const fieldName = <T,>(c: ListColumn<T>) => `${c.key} ${Array.isArray(c.dataIndex) ? c.dataIndex.join('.') : String(c.dataIndex ?? '')}`;

/**
 * Which columns fill a card (UX item 84). A column says so with `card`; where none does, the first column is the title,
 * a column keyed or named `status` the tag, a right-aligned money column (amount, total, value, payable, outstanding)
 * the amount, a column with "date" in its key the date, and the project the line under the title. `card: false` keeps a
 * column off the card, as do the row actions.
 */
export function cardFields<T>(columns: ListColumn<T>[]): CardFields<T> {
  const usable = columns.filter((c) => c.card !== false && c.key !== 'actions');
  const declared = (role: CardRole) => usable.filter((c) => c.card === role);
  const title = declared('title')[0] ?? usable.find((c) => !c.card) ?? usable[0];
  const rest = usable.filter((c) => c !== title && !c.card);
  const guess = (role: CardRole, test: (c: ListColumn<T>) => boolean) => (declared(role).length ? declared(role)[0] : rest.find(test));
  const status = guess('status', (c) => /(^| )status\b/i.test(fieldName(c)));
  const amount = guess('amount', (c) => c.align === 'right' && /amount|total|value|payable|outstanding/i.test(fieldName(c)));
  const date = guess('date', (c) => /date/i.test(fieldName(c)));
  const meta = declared('meta').length ? declared('meta') : rest.filter((c) => /project/i.test(fieldName(c))).slice(0, 1);
  return { title, status: status === title ? undefined : status, amount, date: date === title ? undefined : date, meta };
}

const valueAt = (row: unknown, dataIndex: unknown): unknown => {
  if (dataIndex === undefined || dataIndex === null) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex : [dataIndex];
  return path.reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k as string] : undefined), row);
};

/** What the table would draw in the column's cell for this row. */
function cellOf<T>(c: ListColumn<T>, row: T, index: number): React.ReactNode {
  const value = valueAt(row, c.dataIndex);
  const out: unknown = c.render ? c.render(value, row, index) : value;
  // A render may return { children, props } (antd's cell config).
  if (out && typeof out === 'object' && !Array.isArray(out) && !React.isValidElement(out)) return 'children' in out ? ((out as { children?: React.ReactNode }).children ?? null) : null;
  return out as React.ReactNode;
}

/** The words in a cell, without its links and buttons: the card has one control of its own. */
export function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (React.isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return '';
}

/** The record's own page, from a `RecordLink` in the row's cells, so the card is a real link to it. */
function recordHref(node: React.ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const n of node) {
      const h = recordHref(n);
      if (h) return h;
    }
    return undefined;
  }
  if (!React.isValidElement(node)) return undefined;
  const props = node.props as Record<string, unknown>;
  if (node.type === RecordLink) return typeof props.href === 'string' ? props.href : undefined;
  // Its children, or an element handed in another prop (TwoLine's `top`).
  for (const v of Object.values(props)) {
    if (!React.isValidElement(v) && !Array.isArray(v)) continue;
    const h = recordHref(v as React.ReactNode);
    if (h) return h;
  }
  return undefined;
}

type Pager = Exclude<TableProps<unknown>['pagination'], false | undefined>;

/**
 * A list on a phone (below 768 px, UX item 84): each row is a card with its name, status, amount and date and one
 * line under them. The name is the card's one control, stretched over the whole card, so a tap anywhere opens the record
 * as a click on its row does; a tick box sits beside it when the list has bulk actions. Paging, the totals for the page,
 * the first-load placeholder and the empty state follow the table's.
 */
export function ListCards<T extends { id: string }>({
  columns,
  rows,
  loading,
  firstLoad,
  emptyState,
  table,
  onOpen,
  selectable,
  selectedKeys,
  onSelect,
  totals,
  labelOf,
}: {
  columns: ListColumn<T>[];
  rows: T[];
  loading: boolean;
  firstLoad: boolean;
  emptyState: React.ReactNode;
  table: Pick<TableProps<T>, 'pagination' | 'onChange'>;
  onOpen?: (id: string) => void;
  selectable: boolean;
  selectedKeys: React.Key[];
  onSelect: (keys: React.Key[]) => void;
  /** Show the page's totals (the table shows them with more than one row). */
  totals: boolean;
  labelOf: (c: ListColumn<T>) => string;
}) {
  const prefetch = usePrefetch();
  const fields = cardFields(columns);
  const pager = (table.pagination || undefined) as Pager | undefined;
  const [localPage, setLocalPage] = useState(1);
  const [localSize, setLocalSize] = useState<number | undefined>(undefined);
  const pageSize = pager?.pageSize ?? localSize ?? pager?.defaultPageSize ?? 10;
  const current = pager?.current ?? localPage;
  // Like antd's table: more rows than a page means the list pages them itself.
  const local = !!pager && rows.length > pageSize;
  const pageRows = local ? rows.slice((current - 1) * pageSize, current * pageSize) : rows;
  const total = local ? rows.length : (pager?.total ?? rows.length);

  if (firstLoad)
    return (
      <div role="status" aria-label="Loading" className="list-cards-wrap">
        <ul className="list-cards" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="list-card">
              <Skeleton active title={{ width: '55%' }} paragraph={{ rows: 2, width: ['85%', '40%'] }} />
            </li>
          ))}
        </ul>
      </div>
    );
  if (!rows.length) return <div className="list-cards-empty">{emptyState}</div>;

  const totalColumns = totals && pageRows.length > 1 ? columns.filter((c) => c.total) : [];

  return (
    <Spin spinning={loading}>
      <div className="list-cards-wrap">
        <ul className="list-cards">
          {pageRows.map((row, i) => {
            const index = (local ? (current - 1) * pageSize : 0) + i;
            const titleNode = fields.title ? cellOf(fields.title, row, index) : null;
            const title = (fields.title?.cardText ? textOf(fields.title.cardText(row)) : textOf(titleNode)) || '-';
            const text = (c?: ListColumn<T>) => (c ? (c.cardText ? textOf(c.cardText(row)) : textOf(cellOf(c, row, index))) : '');
            const meta = fields.meta.map((c) => text(c)).filter((t) => t && t !== '-').join(' · ');
            const date = text(fields.date);
            const amount = text(fields.amount);
            const statusNode = fields.status ? cellOf(fields.status, row, index) : null;
            const href = recordHref(titleNode) ?? recordHref(columns.map((c) => cellOf(c, row, index)));
            const checked = selectedKeys.includes(row.id);
            const open = onOpen ? (
              href ? (
                <a
                  href={href}
                  className="list-card-open"
                  onFocus={() => prefetch.record(href)}
                  onTouchStart={() => prefetch.record(href)}
                  onClick={(e) => {
                    // Ctrl or Cmd click, a middle click and "Open in new tab" go to the record's page.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onOpen(row.id);
                  }}
                >
                  {title}
                </a>
              ) : (
                <button type="button" className="list-card-open" onClick={() => onOpen(row.id)}>
                  {title}
                </button>
              )
            ) : (
              <Typography.Text strong>{title}</Typography.Text>
            );
            return (
              <li key={row.id} className={`list-card${onOpen ? ' list-card-link' : ''}${checked ? ' list-card-selected' : ''}`}>
                {selectable ? (
                  <Checkbox
                    className="list-card-check"
                    checked={checked}
                    aria-label={`Select ${title}`}
                    onChange={(e) => onSelect(e.target.checked ? [...selectedKeys, row.id] : selectedKeys.filter((k) => k !== row.id))}
                  />
                ) : null}
                <div className="list-card-body">
                  <div className="list-card-head">
                    <span className="list-card-title">{open}</span>
                    {statusNode ? <span className="list-card-status">{statusNode}</span> : null}
                  </div>
                  {meta ? <div className="list-card-meta">{meta}</div> : null}
                  {date || amount ? (
                    <div className="list-card-foot">
                      <span>{date}</span>
                      {amount && amount !== '-' ? <span className="mono list-card-amount">{amount}</span> : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {totalColumns.length ? (
          <div className="list-card-totals">
            <Typography.Text type="secondary">Total, this page</Typography.Text>
            <dl>
              {totalColumns.map((c) => (
                <div key={c.key}>
                  <dt>{labelOf(c)}</dt>
                  <dd className="mono">{c.total!(pageRows)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {pager && !(pager.hideOnSinglePage && total <= pageSize) ? (
          <Pagination
            className="list-cards-pager"
            size="small"
            showLessItems
            current={current}
            pageSize={pageSize}
            total={total}
            showTotal={pager.showTotal}
            onChange={(page, size) => {
              const sizeChanged = size !== pageSize;
              setLocalPage(sizeChanged ? 1 : page);
              setLocalSize(size);
              pager.onChange?.(page, size);
              table.onChange?.({ ...pager, current: page, pageSize: size }, {}, [], { action: 'paginate', currentDataSource: rows });
            }}
          />
        ) : null}
      </div>
    </Spin>
  );
}
