"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Dropdown,
  Flex,
  Skeleton,
  Table,
  Tooltip,
  Typography,
  theme,
} from "antd";
import type { TableColumnType, TableProps } from "antd";
import {
  ClearOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  LineHeightOutlined,
} from "@/components/common/icons";
import { readPref, writePref } from "@/lib/prefs";
import { useStickyTop } from "@/lib/sticky";
import { useSingleKeys } from "@/lib/shortcuts";
import { EmptyArt } from "@/components/common/EmptyArt";
import { HOVER_INTENT_MS, usePrefetch } from "@/lib/prefetch";
import { useIsPhone, useWidthsReached } from "@/lib/screen";
import { ListCards, type CardRole } from "./ListCards";

/** A list column: antd's, with a stable `key`, a plain-text `label` for the column chooser, and an optional page total. */
export type ListColumn<T> = TableColumnType<T> & {
  key: string;
  /** Name in the column chooser (defaults to the title when that is text). */
  label?: string;
  /** Always shown (the record's name, the actions). */
  locked?: boolean;
  /** Off until someone turns it on. */
  defaultHidden?: boolean;
  /**
   * A lower-priority column: on by default only on a window at least this wide (CSS pixels), so the default view fits
   * without sideways scrolling (UX item 84). The column chooser still turns it on anywhere.
   */
  defaultFrom?: number;
  /** What it is on a phone's card (see `cardFields`); false keeps it off the card. */
  card?: CardRole | false;
  /** The card's words for it, where the cell holds a link or more than text. */
  cardText?: (row: T) => React.ReactNode;
  /** Figure for the totals row, over the rows on this page. */
  total?: (rows: T[]) => React.ReactNode;
};

const labelOf = <T,>(c: ListColumn<T>) =>
  c.label ?? (typeof c.title === "string" ? c.title : c.key);

/** Which columns show, in order, kept per list on this browser. */
export function useColumnChoice<T>(list: string, columns: ListColumn<T>[]) {
  const key = `nirmaan.columns.${list}`;
  const widths = useMemo(
    () => [
      ...new Set(
        columns.map((c) => c.defaultFrom).filter((w): w is number => !!w),
      ),
    ],
    [columns],
  );
  const reached = useWidthsReached(widths);
  const defaults = useMemo(
    () =>
      columns
        .filter(
          (c) =>
            !c.defaultHidden && (!c.defaultFrom || reached.has(c.defaultFrom)),
        )
        .map((c) => c.key),
    [columns, reached],
  );
  const [chosen, setChosenRaw] = useState<string[] | null>(() =>
    readPref<string[] | null>(key, null),
  );
  const visible = useMemo(() => {
    const keys = new Set(chosen ?? defaults);
    return columns.filter((c) => c.locked || keys.has(c.key)).map((c) => c.key);
  }, [chosen, defaults, columns]);
  const setChosen = (next: string[] | null) => {
    setChosenRaw(next);
    writePref(key, next);
  };
  return { visible, chosen, setChosen, isDefault: chosen === null };
}

export interface BulkAction<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Only offered when every selected row qualifies. */
  allowed?: (rows: T[]) => boolean;
  run: (rows: T[]) => Promise<void> | void;
  primary?: boolean;
  danger?: boolean;
}

/**
 * The table of a list page (UI roadmap item 55): the column chooser and wrap switch, a header that stays in view,
 * click a row to open it, select rows for the bulk bar, and a totals row for the figures on the page.
 * From the keyboard (UX item 81) the rows are one Tab stop: ↑ ↓ (or J K) move between them, Enter opens one and X ticks it.
 */
export function DataTable<T extends { id: string }>({
  columns,
  visible,
  onChooseColumns,
  chosenIsDefault,
  rows,
  loading,
  table,
  onOpen,
  bulk = [],
  chips,
  scrollX,
  emptyText,
  emptyAction,
  empty,
  failed,
  className,
  expandable,
}: {
  columns: ListColumn<T>[];
  /** Keys of the columns to show (from useColumnChoice). */
  visible: string[];
  onChooseColumns: (keys: string[] | null) => void;
  chosenIsDefault: boolean;
  rows: T[];
  loading?: boolean;
  table: Pick<TableProps<T>, "pagination" | "onChange">;
  /** Click on a row; left out, rows are not clickable (a list whose rows open nothing for this user). */
  onOpen?: (id: string) => void;
  bulk?: BulkAction<T>[];
  /** Active filter chips, shown on the strip above the table. */
  chips?: React.ReactNode;
  scrollX?: number;
  emptyText?: React.ReactNode;
  /** The list's own New button, offered again when there is nothing yet (not when filters hide everything). */
  emptyAction?: React.ReactNode;
  /** From `useListFrame`: whether filters are on, and how to drop them. */
  empty?: { filtered: boolean; clear: () => void };
  /** The list's query failed; the page shows why (QueryError), so the table only says it has nothing to show. */
  failed?: boolean;
  className?: string;
  /** Lines that open under a row (a toolbox talk's notes). */
  expandable?: TableProps<T>["expandable"];
}) {
  const { token } = theme.useToken();
  const stickyTop = useStickyTop();
  // Below 768 px each row is a card (UX item 84).
  const phone = useIsPhone();
  const [wrap, setWrap] = useState(() =>
    readPref<boolean>("nirmaan.table.wrap", false),
  );
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Selection is of rows on screen; a new page or filter clears it.
  const selected = rows.filter((r) => selectedKeys.includes(r.id));
  // The row that takes Tab: the last one focused, on this page.
  const [activeRow, setActiveRow] = useState(0);
  const tabRow = Math.min(activeRow, Math.max(rows.length - 1, 0));
  const tableRef = useRef<HTMLDivElement>(null);
  const [singleKeys] = useSingleKeys();
  // A row the pointer rests on, or that takes focus, fetches its record ahead (item 83) through its RecordLink.
  const prefetch = usePrefetch();
  const hoverTimer = useRef<number | undefined>(undefined);
  const fetchRowAhead = (tr: HTMLElement) =>
    prefetch.record(
      tr
        .querySelector<HTMLAnchorElement>("a[data-record-link][href]")
        ?.getAttribute("href"),
    );
  const focusRow = (i: number) => {
    const trs = tableRef.current?.querySelectorAll<HTMLTableRowElement>(
      ".ant-table-tbody > tr[data-row-key]",
    );
    if (!trs?.length) return;
    trs[Math.max(0, Math.min(i, trs.length - 1))].focus();
  };
  const onRowKey = (
    e: React.KeyboardEvent<HTMLElement>,
    r: T,
    index: number,
  ) => {
    // Keys pressed inside a link, button or box in the row are theirs.
    if (e.target !== e.currentTarget || !onOpen) return;
    const single = singleKeys && !e.ctrlKey && !e.metaKey && !e.altKey;
    const key = e.key.toLowerCase();
    if (e.key === "Enter") onOpen(r.id);
    else if (e.key === "ArrowDown" || (single && key === "j"))
      focusRow(index + 1);
    else if (e.key === "ArrowUp" || (single && key === "k"))
      focusRow(index - 1);
    else if (e.key === "Home") focusRow(0);
    else if (e.key === "End") focusRow(rows.length - 1);
    else if (single && key === "x" && bulk.length)
      setSelectedKeys((keys) =>
        keys.includes(r.id) ? keys.filter((k) => k !== r.id) : [...keys, r.id],
      );
    else return;
    e.preventDefault();
  };

  const shown = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return visible
      .map((k) => byKey.get(k))
      .filter((c): c is ListColumn<T> => !!c)
      .map((c) => ({ ...c, ellipsis: wrap ? false : c.ellipsis }));
  }, [columns, visible, wrap]);

  const hasTotals = shown.some((c) => c.total);
  // The table scrolls sideways only as far as the columns on show need, not to the width of all of them.
  const shownWidth =
    shown.reduce(
      (n, c) => n + (typeof c.width === "number" ? c.width : 140),
      0,
    ) + (bulk.length ? 40 : 0);
  const scrollWidth = scrollX ? Math.min(scrollX, shownWidth) : undefined;
  // The first load draws rows of placeholders, not a spinner over "No data".
  const firstLoad = !!loading && rows.length === 0;
  const emptyNext = empty?.filtered ? (
    <Button icon={<ClearOutlined />} onClick={empty.clear}>
      Clear filters
    </Button>
  ) : (
    emptyAction
  );
  const emptyState = firstLoad ? (
    <div
      aria-busy="true"
      aria-label="Loading"
      style={{ padding: `${token.paddingXS}px 0`, textAlign: "left" }}
    >
      <Skeleton
        active
        title={false}
        paragraph={{
          rows: 6,
          width: ["100%", "96%", "100%", "92%", "100%", "88%"],
        }}
      />
    </div>
  ) : failed ? (
    <Typography.Text type="secondary">
      The list could not load. Try again in a moment.
    </Typography.Text>
  ) : (
    <div>
      {emptyText ?? <EmptyArt art="entries" title="Nothing here yet" />}
      {emptyNext ? (
        <div
          style={{ marginTop: -token.marginXS, paddingBottom: token.padding }}
        >
          {emptyNext}
        </div>
      ) : null}
    </div>
  );
  const chooser = (
    <Dropdown
      trigger={["click"]}
      placement="bottomRight"
      popupRender={() => (
        <div
          style={{
            padding: token.paddingSM,
            maxHeight: 360,
            overflowY: "auto",
            background: token.colorBgElevated,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
          }}
        >
          <Flex vertical gap={token.marginXXS}>
            {columns
              .filter((c) => !c.locked)
              .map((c) => (
                <Checkbox
                  key={c.key}
                  checked={visible.includes(c.key)}
                  onChange={(e) =>
                    onChooseColumns(
                      e.target.checked
                        ? columns
                            .filter(
                              (x) => x.key === c.key || visible.includes(x.key),
                            )
                            .map((x) => x.key)
                        : visible.filter((k) => k !== c.key),
                    )
                  }
                >
                  {labelOf(c)}
                </Checkbox>
              ))}
            <Button
              size="small"
              type="link"
              disabled={chosenIsDefault}
              onClick={() => onChooseColumns(null)}
              style={{ alignSelf: "flex-start", paddingInline: 0 }}
            >
              Reset columns
            </Button>
          </Flex>
        </div>
      )}
    >
      <Button size="small" icon={<ColumnWidthOutlined />}>
        Columns
      </Button>
    </Dropdown>
  );

  const runBulk = async (a: BulkAction<T>) => {
    setBusy(a.key);
    try {
      await a.run(selected);
      setSelectedKeys([]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Flex
        align="center"
        gap={token.marginXS}
        wrap
        style={{
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
          minHeight: phone
            ? undefined
            : token.controlHeight + token.paddingXS * 2,
        }}
      >
        {selected.length > 0 ? (
          <Flex
            align="center"
            gap={token.marginXS}
            wrap
            role="toolbar"
            aria-label="Selected rows"
            style={{ flex: 1 }}
          >
            <Typography.Text strong>{selected.length} selected</Typography.Text>
            {bulk
              .filter((a) => !a.allowed || a.allowed(selected))
              .map((a) => (
                <Button
                  key={a.key}
                  size="small"
                  type={a.primary ? "primary" : "default"}
                  danger={a.danger}
                  icon={a.icon}
                  loading={busy === a.key}
                  disabled={!!busy && busy !== a.key}
                  onClick={() => runBulk(a)}
                >
                  {a.label}
                </Button>
              ))}
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setSelectedKeys([])}
            >
              Clear
            </Button>
          </Flex>
        ) : (
          <Flex
            align="center"
            gap={token.marginXS}
            wrap
            style={{ flex: 1, minWidth: 0 }}
          >
            {chips}
          </Flex>
        )}
        {/* Cards show every line in full and choose their own fields. */}
        {phone ? null : (
          <Tooltip
            title={
              wrap ? "Cut long text to one line" : "Show long text in full"
            }
          >
            <Button
              size="small"
              color="default"
              variant={wrap ? "filled" : "outlined"}
              icon={<LineHeightOutlined />}
              aria-pressed={wrap}
              aria-label="Wrap long text"
              onClick={() => {
                setWrap(!wrap);
                writePref("nirmaan.table.wrap", !wrap);
              }}
            />
          </Tooltip>
        )}
        {phone ? null : chooser}
      </Flex>
      {phone ? (
        <ListCards<T>
          columns={columns}
          rows={rows}
          loading={!!loading && !firstLoad}
          firstLoad={firstLoad}
          emptyState={emptyState}
          table={table}
          onOpen={onOpen}
          selectable={bulk.length > 0}
          selectedKeys={selectedKeys}
          onSelect={setSelectedKeys}
          totals={hasTotals || columns.some((c) => c.total)}
          labelOf={labelOf}
        />
      ) : (
        <div ref={tableRef}>
          <Table<T>
            rowKey="id"
            className={className}
            expandable={expandable}
            loading={loading && !firstLoad}
            columns={shown}
            dataSource={rows}
            size="middle"
            sticky={{ offsetHeader: stickyTop }}
            {...table}
            scroll={{ x: scrollWidth }}
            rowSelection={
              bulk.length
                ? {
                    selectedRowKeys: selectedKeys,
                    onChange: setSelectedKeys,
                    columnWidth: 40,
                  }
                : undefined
            }
            rowClassName={onOpen ? () => "row-click" : undefined}
            onRow={
              onOpen
                ? (r, index = 0) => ({
                    tabIndex: index === tabRow ? 0 : -1,
                    "aria-keyshortcuts": "Enter",
                    onFocus: (e) => {
                      if (e.target !== e.currentTarget) return;
                      setActiveRow(index);
                      fetchRowAhead(e.currentTarget);
                    },
                    onMouseEnter: (e) => {
                      const tr = e.currentTarget;
                      window.clearTimeout(hoverTimer.current);
                      hoverTimer.current = window.setTimeout(
                        () => fetchRowAhead(tr),
                        HOVER_INTENT_MS,
                      );
                    },
                    onMouseLeave: () => window.clearTimeout(hoverTimer.current),
                    onKeyDown: (e) => onRowKey(e, r, index),
                    onClick: (e) => {
                      // Links, buttons, checkboxes, switches and menus in the row do their own thing.
                      if (
                        (e.target as HTMLElement).closest(
                          "a, button, input, label, .ant-dropdown, .ant-checkbox-wrapper, .ant-image, .ant-switch",
                        )
                      )
                        return;
                      onOpen(r.id);
                    },
                  })
                : undefined
            }
            locale={{ emptyText: emptyState }}
            summary={
              hasTotals && rows.length > 1
                ? (data) => (
                    <Table.Summary>
                      <Table.Summary.Row>
                        {bulk.length ? <Table.Summary.Cell index={0} /> : null}
                        {shown.map((c, i) => (
                          <Table.Summary.Cell
                            key={c.key}
                            index={i + (bulk.length ? 1 : 0)}
                            align={c.align}
                          >
                            {c.total ? (
                              <span
                                className="mono" translate="no"
                                style={{ fontWeight: token.fontWeightStrong }}
                              >
                                {c.total([...data])}
                              </span>
                            ) : i === 0 ? (
                              <Typography.Text type="secondary">
                                Page total
                              </Typography.Text>
                            ) : null}
                          </Table.Summary.Cell>
                        ))}
                      </Table.Summary.Row>
                    </Table.Summary>
                  )
                : undefined
            }
          />
        </div>
      )}
    </>
  );
}
