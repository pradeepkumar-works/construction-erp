'use client';

import React from 'react';
import { useListPage } from '@/lib/listPage';
import { EmptyArt } from '@/components/common/EmptyArt';
import { DataTable, useColumnChoice, type BulkAction, type ListColumn } from './DataTable';

const NO_KEYS: string[] = [];

/**
 * A list worked out in the browser from a summary the page already has (an ageing table in a tab of Payables or
 * Receivables): the list template's columns, column choice, phone cards and paging (25 rows a page), with
 * nothing in the address bar.
 */
export function LocalDataTable<T extends { id: string }>({
  list,
  columns,
  rows,
  loading,
  failed,
  bulk,
  onOpen,
  scrollX,
  emptyText,
  expandable,
}: {
  /** Where its columns are kept on this browser. */
  list: string;
  columns: ListColumn<T>[];
  rows: T[];
  loading: boolean;
  failed: boolean;
  bulk?: BulkAction<T>[];
  onOpen?: (id: string) => void;
  scrollX?: number;
  emptyText: React.ReactNode;
  expandable?: React.ComponentProps<typeof DataTable<T>>['expandable'];
}) {
  const page = useListPage<'name'>({ keys: NO_KEYS, sortBy: 'name', sortOrder: 'asc', sortFields: [], url: false });
  const choice = useColumnChoice(list, columns);
  return (
    <DataTable<T>
      columns={columns}
      visible={choice.visible}
      onChooseColumns={choice.setChosen}
      chosenIsDefault={choice.isDefault}
      rows={rows}
      loading={loading}
      failed={failed}
      table={page.tableProps<T>(rows.length)}
      onOpen={onOpen}
      bulk={bulk}
      scrollX={scrollX}
      emptyText={typeof emptyText === 'string' ? <EmptyArt art="entries" title={emptyText} /> : emptyText}
      expandable={expandable}
    />
  );
}
