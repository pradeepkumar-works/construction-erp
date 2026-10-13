'use client';

import { useCallback, useMemo, useState } from 'react';
import type { TablePaginationConfig, TableProps } from 'antd';
import type { SorterResult } from 'antd/es/table/interface';
import { DEFAULT_PAGE_SIZE, type SortOrder } from '@erp/shared';

export interface ListStateParams<S extends string> {
  page: number;
  pageSize: number;
  q?: string;
  sortBy: S;
  sortOrder: SortOrder;
}

/**
 * Page, page size, search text and sort of one server-paged table.
 * `tableProps(total)` wires an antd Table to it; `sortOrderFor(key)` makes a column's sort arrow controlled.
 */
export function useListState<S extends string>(defaults: { sortBy: S; sortOrder: SortOrder; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaults.pageSize ?? DEFAULT_PAGE_SIZE);
  const [search, setSearchRaw] = useState('');
  const [sort, setSort] = useState<{ sortBy: S; sortOrder: SortOrder }>({ sortBy: defaults.sortBy, sortOrder: defaults.sortOrder });

  const params = useMemo<ListStateParams<S>>(() => ({ page, pageSize, q: search.trim() || undefined, ...sort }), [page, pageSize, search, sort]);

  /** Changing search or a filter goes back to page 1. */
  const setSearch = useCallback((v: string) => {
    setSearchRaw(v);
    setPage(1);
  }, []);
  const resetPage = useCallback(() => setPage(1), []);

  const sortOrderFor = useCallback((key: S): 'ascend' | 'descend' | null => (sort.sortBy === key ? (sort.sortOrder === 'asc' ? 'ascend' : 'descend') : null), [sort]);

  function tableProps<T>(total: number | undefined): Pick<TableProps<T>, 'pagination' | 'onChange'> {
    return {
      pagination: {
        current: page,
        pageSize,
        total: total ?? 0,
        showSizeChanger: true,
        pageSizeOptions: [10, 25, 50, 100],
        showTotal: (t, [from, to]) => `${from}-${to} of ${t}`,
        hideOnSinglePage: false,
      },
      onChange: (pag: TablePaginationConfig, _filters, sorter, extra) => {
        if (extra.action === 'sort') {
          const s = (Array.isArray(sorter) ? sorter[0] : sorter) as SorterResult<T>;
          const key = (s?.columnKey as S | undefined) ?? undefined;
          if (key && s.order) setSort({ sortBy: key, sortOrder: s.order === 'ascend' ? 'asc' : 'desc' });
          else setSort({ sortBy: defaults.sortBy, sortOrder: defaults.sortOrder });
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

  return { params, search, setSearch, resetPage, sortOrderFor, tableProps };
}

export type ListState<S extends string> = ReturnType<typeof useListState<S>>;
