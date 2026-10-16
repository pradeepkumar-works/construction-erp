'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TablePaginationConfig, TableProps } from 'antd';
import type { SorterResult } from 'antd/es/table/interface';
import { DEFAULT_PAGE_SIZE, type SortOrder } from '@erp/shared';

/** A list's filters as strings, the way they sit in the URL and in a saved view: `q`, `status`, `from`, `sortBy`… */
export type ListFilters = Record<string, string>;

/** Same filters (order and blanks aside). */
export const sameFilters = (a: ListFilters, b: ListFilters) => {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

const readUrl = (keys: readonly string[]): ListFilters => {
  const out: ListFilters = {};
  try {
    const sp = new URLSearchParams(window.location.search);
    for (const k of keys) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
  } catch {
    // No URL to read (tests); start empty.
  }
  return out;
};

/**
 * The state of a list page (UI roadmap item 55): filters, search and sort as one set of strings, kept in the URL so a
 * filtered list can be bookmarked or sent, plus paging. `keys` are the filters this list understands (besides `q`,
 * `sortBy` and `sortOrder`). With `url: false` (a list inside a project tab) nothing is written to the address bar, and
 * `initial` (a link's "low stock only") is where the filters start.
 */
export function useListPage<S extends string>(opts: { keys: readonly string[]; sortBy: S; sortOrder: SortOrder; sortFields?: readonly S[]; url?: boolean; scope?: string; initial?: ListFilters }) {
  const { keys, url = true, scope } = opts;
  const allKeys = useMemo(() => [...keys, 'q', 'sortBy', 'sortOrder'], [keys]);
  const [filters, setFiltersRaw] = useState<ListFilters>(() => (url ? readUrl(allKeys) : (opts.initial ?? {})));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Another project picked in the header: back to page 1.
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== lastScope) {
    setLastScope(scope);
    setPage(1);
  }

  // The address bar follows the filters; other parameters (?id=, ?tab=) are left alone.
  useEffect(() => {
    if (!url) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      for (const k of allKeys) sp.delete(k);
      for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, v);
      const qs = sp.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', next);
    } catch {
      // Address bar not writable; the list still filters.
    }
  }, [filters, url, allKeys]);

  /** Sets (or clears, with no value) one filter and goes back to page 1. */
  const setFilter = useCallback((key: string, value?: string | null) => {
    setFiltersRaw((old) => {
      const next = { ...old };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  /** Replaces every filter (a view was picked). */
  const setFilters = useCallback((next: ListFilters) => {
    setFiltersRaw(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
    setPage(1);
  }, []);

  // A sort from an old link or view that this list no longer has falls back to the default.
  const urlSort = filters.sortBy as S | undefined;
  const sortBy = urlSort && (!opts.sortFields || opts.sortFields.includes(urlSort)) ? urlSort : opts.sortBy;
  const sortOrder: SortOrder = filters.sortOrder === 'asc' || filters.sortOrder === 'desc' ? filters.sortOrder : opts.sortOrder;

  /** What every list sends the API: paging, sort, search, mine and dates. A list adds its own filters (status…) from `filters`. */
  const params = useMemo(
    () => ({
      page,
      pageSize,
      sortBy,
      sortOrder,
      q: filters.q?.trim() || undefined,
      mine: filters.mine === '1' ? true : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [filters, page, pageSize, sortBy, sortOrder],
  );

  const sortOrderFor = useCallback((key: S): 'ascend' | 'descend' | null => (sortBy === key ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null), [sortBy, sortOrder]);

  function tableProps<T>(total: number | undefined): Pick<TableProps<T>, 'pagination' | 'onChange'> {
    return {
      pagination: {
        current: page,
        pageSize,
        total: total ?? 0,
        showSizeChanger: true,
        pageSizeOptions: [10, 25, 50, 100],
        showTotal: (t, [from, to]) => `${from}-${to} of ${t}`,
      },
      onChange: (pag: TablePaginationConfig, _f, sorter, extra) => {
        if (extra.action === 'sort') {
          const s = (Array.isArray(sorter) ? sorter[0] : sorter) as SorterResult<T>;
          const key = s?.columnKey as string | undefined;
          setFiltersRaw((old) => {
            const next = { ...old };
            delete next.sortBy;
            delete next.sortOrder;
            if (key && s.order && !(key === opts.sortBy && (s.order === 'ascend' ? 'asc' : 'desc') === opts.sortOrder)) {
              next.sortBy = key;
              next.sortOrder = s.order === 'ascend' ? 'asc' : 'desc';
            }
            return next;
          });
          setPage(1);
          return;
        }
        if (pag.pageSize && pag.pageSize !== pageSize) {
          setPageSize(pag.pageSize);
          setPage(1);
          return;
        }
        setPage(pag.current ?? 1);
      },
    };
  }

  const setSearch = useCallback((v: string) => setFilter('q', v), [setFilter]);

  /** Drops some filters (a chip closed); with no keys, all of them but the sort. */
  const clear = useCallback((only?: string[]) => {
    setFiltersRaw((old) => {
      const next: ListFilters = {};
      for (const [k, v] of Object.entries(old)) if (only ? !only.includes(k) : k === 'sortBy' || k === 'sortOrder') next[k] = v;
      return next;
    });
    setPage(1);
  }, []);

  return { filters, setFilter, setFilters, clear, params, search: filters.q ?? '', setSearch, sortOrderFor, tableProps };
}

export type ListPage<S extends string> = ReturnType<typeof useListPage<S>>;

/** Monday of this week to today, as the sites count days (India). */
export function thisWeek(): { from: string; to: string } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return { from: monday.toISOString().slice(0, 10), to: today };
}
