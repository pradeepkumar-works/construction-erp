"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Dropdown,
  Flex,
  Skeleton,
  Table,
  Tooltip,
  Typography,
} from "antd";
import type { TableColumnType, TableProps } from "antd";
import {
  ClearOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  LineHeightOutlined,
} from "@/components/common/icons";
import { columnsToDrop, formatInScale, moneyScale, toNumber, type MoneyScale } from "@erp/shared";
import { readPref, writePref } from "@/lib/prefs";
import { formatINR, formatPct, formatQty, NO_VALUE } from "@/lib/format";
import { useStickyTop } from "@/lib/sticky";
import { useSingleKeys } from "@/lib/shortcuts";
import { EmptyLine } from "@/components/common/EmptyArt";
import { HOVER_INTENT_MS, usePrefetch } from "@/lib/prefetch";
import { useIsPhone } from "@/lib/screen";
import { tk } from "@/ds";
import { ListCards, type CardRole } from "./ListCards";
import { ROW_OWN_CONTROLS } from "./openableRow";

/** What a column's figures are: the column then aligns them right on one line in the figures face and formats them. */
export type ColumnKind = "money" | "qty" | "pct";

/** A list column: antd's, with a stable `key`, a plain-text `label` for the column chooser, and an optional total. */
export type ListColumn<T> = TableColumnType<T> & {
  key: string;
  /** Name in the column chooser (defaults to the title when that is text). */
  label?: string;
  /** Always shown (the record's name, the actions). */
  locked?: boolean;
  /** Off until someone turns it on. */
  defaultHidden?: boolean;
  /**
   * A lower-priority column: in the default view it is left out when the table is too narrow for every column, wider
   * numbers first (`columnsToDrop`), so the answer never sits past a sideways scroll. The column chooser still turns it on.
   */
  defaultFrom?: number;
  /**
   * Its figures. `money` writes the whole column in one scale (₹ L or ₹ Cr, `moneyScale` over the rows shown) with the
   * exact figure on hover; `qty` a quantity with its unit; `pct` a percentage. Without a `render`, the cell is the figure.
   */
  kind?: ColumnKind;
  /** The figure, where it is not the `dataIndex` field. */
  value?: (row: T) => string | number | null | undefined;
  /** A quantity's unit for the row ("m³"). */
  unit?: (row: T) => string | null | undefined;
  /** The column's figures in bold (the one that answers the list's question). */
  strong?: boolean;
  /** A row's figure in a meaning's colour (an overdue amount in `danger`); none keeps the text colour. */
  tone?: (row: T) => "danger" | undefined;
  /** What it is on a phone's card (see `cardFields`); false keeps it off the card. */
  card?: CardRole | false;
  /** The card's words for it, where the cell holds a link or more than text. */
  cardText?: (row: T) => React.ReactNode;
  /**
   * Figure for the totals row, over the rows shown. The row only draws when every row of the filtered list is on screen,
   * so it is a total, never a page's; give it only where adding the rows up means something.
   */
  total?: (rows: T[]) => React.ReactNode;
};

/** The width the fit counts for a column that names none; the record's own column counts more and keeps it as a minimum. */
const ASSUMED_WIDTH = 140;
const TITLE_MIN_WIDTH = 240;
const isTitle = <T,>(c: ListColumn<T>) => c.card === "title" || (c.locked && c.key !== "actions");

const pathOf = (dataIndex: unknown): string[] =>
  dataIndex === undefined || dataIndex === null ? [] : (Array.isArray(dataIndex) ? dataIndex : [dataIndex]).map(String);
/** A column's figure for a row: its `value`, else the `dataIndex` field. */
export function figureOf<T>(c: ListColumn<T>, row: T): string | number | null | undefined {
  if (c.value) return c.value(row);
  return pathOf(c.dataIndex).reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), row) as
    | string
    | number
    | null
    | undefined;
}
const blank = (v: unknown) => v === null || v === undefined || v === "";

/** A column's cells on one line, whatever its width. */
const oneLine = <T,>(c: ListColumn<T>): ListColumn<T> => ({
  ...c,
  onCell: (row, i) => ({ ...c.onCell?.(row, i), style: { whiteSpace: "nowrap", ...c.onCell?.(row, i)?.style } }),
});
const isMono = <T,>(c: ListColumn<T>) => typeof c.className === "string" && c.className.split(" ").includes("mono");

/**
 * A column's cells from its kind: alignment, one line, the figures face, and the formatter where it has no render. A
 * record's number (a `mono` column) stays on one line too, so its width must hold it.
 */
function withKind<T>(c: ListColumn<T>, scale: MoneyScale): ListColumn<T> {
  if (!c.kind) return isMono(c) ? oneLine(c) : c;
  const Tag = c.strong ? "strong" : "span";
  const cell = (row: T): React.ReactNode => {
    const v = figureOf(c, row);
    if (blank(v)) return <span className="text-muted">{NO_VALUE}</span>;
    const tone = c.tone?.(row);
    const style = tone ? { color: tk.color.tone[tone].fg } : undefined;
    if (c.kind === "money")
      return (
        <Tag className="mono" translate="no" style={style} title={scale === "rupees" ? undefined : formatINR(v)}>
          {formatInScale(v, scale)}
        </Tag>
      );
    if (c.kind === "pct")
      return (
        <Tag className="mono" translate="no" style={style}>
          {formatPct(toNumber(v))}
        </Tag>
      );
    const unit = c.unit?.(row);
    return (
      <Tag className="mono" translate="no" style={style}>
        {formatQty(v)}
        {unit ? <span className="text-muted"> {unit}</span> : null}
      </Tag>
    );
  };
  return oneLine({
    ...c,
    align: c.align ?? "right",
    ellipsis: false,
    render: c.render ?? ((_: unknown, row: T) => cell(row)),
  });
}

const labelOf = <T,>(c: ListColumn<T>) =>
  c.label ?? (typeof c.title === "string" ? c.title : c.key);

/**
 * Which columns show, in order, kept per list on this browser. Until someone chooses, it is every column not
 * `defaultHidden`; the table then leaves out what its own width cannot hold (`defaultFrom`).
 */
export function useColumnChoice<T>(list: string, columns: ListColumn<T>[]) {
  const key = `nirmaan.columns.${list}`;
  const defaults = useMemo(() => columns.filter((c) => !c.defaultHidden).map((c) => c.key), [columns]);
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

/**
 * The width of the box the table sits in, following resizes; 0 until the browser has laid it out. A ResizeObserver
 * reports once as it starts, after layout and before paint, so the first frame drawn already fits.
 */
function useBoxWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return width;
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
 * The table of a list page: the column chooser and wrap switch, a header that stays in view,
 * click a row to open it, select rows for the bulk bar, and a totals row for the figures on the page.
 * From the keyboard the rows are one Tab stop: ↑ ↓ (or J K) move between them, Enter opens one and X ticks it.
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
  const stickyTop = useStickyTop();
  // Below 768 px each row is a card.
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
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [singleKeys] = useSingleKeys();
  // A row the pointer rests on, or that takes focus, fetches its record ahead through its RecordLink.
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

  const boxWidth = useBoxWidth(box);
  const widthOf = (c: ListColumn<T>) =>
    typeof c.width === "number" ? c.width : isTitle(c) ? TITLE_MIN_WIDTH : ASSUMED_WIDTH;
  const chosenColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return visible.map((k) => byKey.get(k)).filter((c): c is ListColumn<T> => !!c);
  }, [columns, visible]);
  // Until someone chooses columns, the table leaves out what its width cannot hold; their own choice scrolls instead.
  const dropped = useMemo(
    () =>
      chosenIsDefault && boxWidth
        ? new Set(
            columnsToDrop(
              chosenColumns.map((c) => ({ key: c.key, width: widthOf(c), dropFrom: c.locked ? undefined : c.defaultFrom })),
              boxWidth - (bulk.length ? 40 : 0),
            ),
          )
        : new Set<string>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosenIsDefault, boxWidth, chosenColumns, bulk.length],
  );
  // One money scale per column, over the rows on screen.
  const scales = useMemo(
    () =>
      new Map(
        columns
          .filter((c) => c.kind === "money")
          .map((c) => [c.key, moneyScale(rows.map((r) => figureOf(c, r)))] as const),
      ),
    [columns, rows],
  );
  const cardColumns = useMemo(() => columns.map((c) => withKind(c, scales.get(c.key) ?? "rupees")), [columns, scales]);
  const shownWidth =
    chosenColumns.filter((c) => !dropped.has(c.key)).reduce((n, c) => n + widthOf(c), 0) + (bulk.length ? 40 : 0);
  // The table scrolls sideways only when what is on show does not fit; then a pinned column stays put over the rest.
  const scrolls = !!boxWidth && shownWidth > boxWidth;
  const shown = useMemo(
    () =>
      chosenColumns
        .filter((c) => !dropped.has(c.key))
        .map((c) => withKind(c, scales.get(c.key) ?? "rupees"))
        .map((c) => ({
          ...c,
          ellipsis: wrap ? false : c.ellipsis,
          fixed: scrolls ? c.fixed : undefined,
          minWidth: isTitle(c) && typeof c.width !== "number" ? TITLE_MIN_WIDTH : c.minWidth,
        })),
    [chosenColumns, dropped, scales, wrap, scrolls],
  );
  const shownKeys = shown.map((c) => c.key);

  // A total only where every row of the list is on screen: a page's sum answers nothing.
  const pagination = table.pagination;
  const everyRow =
    pagination === false || pagination === undefined || (pagination.total ?? rows.length) <= rows.length;
  const hasTotals = everyRow && shown.some((c) => c.total);
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
      style={{ padding: `${tk.space[2]} 0`, textAlign: "left" }}
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
      {emptyText ?? <EmptyLine title="Nothing here yet" />}
      {emptyNext ? (
        <div
          style={{ marginTop: tk.neg(2), paddingBottom: tk.space[4] }}
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
            padding: tk.space[3],
            maxHeight: 360,
            overflowY: "auto",
            background: tk.color.surface.raised,
            borderRadius: tk.radius.lg,
            boxShadow: tk.shadow.float,
          }}
        >
          <Flex vertical gap={tk.space[1]}>
            {columns
              .filter((c) => !c.locked)
              .map((c) => (
                <Checkbox
                  key={c.key}
                  checked={shownKeys.includes(c.key)}
                  onChange={(e) =>
                    onChooseColumns(
                      e.target.checked
                        ? columns
                            .filter(
                              (x) => x.key === c.key || shownKeys.includes(x.key),
                            )
                            .map((x) => x.key)
                        : shownKeys.filter((k) => k !== c.key),
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
        gap={tk.space[2]}
        wrap
        style={{
          padding: `${tk.space[2]} ${tk.space[3]}`,
          minHeight: phone
            ? undefined
            : `calc(${tk.control.md} + 2 * ${tk.space[2]})`,
        }}
      >
        {selected.length > 0 ? (
          <Flex
            align="center"
            gap={tk.space[2]}
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
            gap={tk.space[2]}
            wrap
            style={{ flex: 1, minWidth: 0 }}
          >
            {chips}
          </Flex>
        )}
        {/* Cards show every line in full and choose their own fields. The table's own tools keep the right end. */}
        {phone ? null : (
          <Flex align="center" gap={tk.space[2]} style={{ marginInlineStart: "auto" }}>
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
            {chooser}
          </Flex>
        )}
      </Flex>
      {phone ? (
        <ListCards<T>
          columns={cardColumns}
          rows={rows}
          loading={!!loading && !firstLoad}
          firstLoad={firstLoad}
          emptyState={emptyState}
          table={table}
          onOpen={onOpen}
          selectable={bulk.length > 0}
          selectedKeys={selectedKeys}
          onSelect={setSelectedKeys}
          totals={everyRow && columns.some((c) => c.total)}
          labelOf={labelOf}
        />
      ) : (
        <div
          ref={(el) => {
            tableRef.current = el;
            setBox(el);
          }}
        >
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
            scroll={{ x: scrolls ? shownWidth : undefined }}
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
                          ROW_OWN_CONTROLS,
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
                ? () => (
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
                                style={{ fontWeight: tk.type.strong.fontWeight }}
                              >
                                {c.total(rows)}
                              </span>
                            ) : i === 0 ? (
                              <Typography.Text type="secondary">
                                Total
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
