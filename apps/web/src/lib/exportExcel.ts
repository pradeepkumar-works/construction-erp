'use client';

import * as XLSX from 'xlsx';
import { MAX_PAGE_SIZE, type Paginated } from '@erp/shared';
import { api } from './api';

/** Safety cap for one export (MAX_PAGE_SIZE rows per request). */
const MAX_EXPORT_PAGES = 40;

/** Fetch every row of a paged list with the given filters, page by page. */
export async function fetchAllPages<T>(path: string, params: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  const base = Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== undefined && v !== null && v !== '' && k !== 'page' && k !== 'pageSize'));
  for (let page = 1; page <= MAX_EXPORT_PAGES; page++) {
    const { data } = await api.get<Paginated<T>>(path, { params: { ...base, page, pageSize: MAX_PAGE_SIZE } });
    out.push(...data.items);
    if (out.length >= data.total || data.items.length === 0) break;
  }
  return out;
}

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Column width in characters. */
  width?: number;
}

/** Write rows to a one-sheet .xlsx and start the download. */
export function downloadXlsx<T>(fileName: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]) {
  const aoa = [columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r) ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map((c) => ({ wch: c.width ?? Math.max(10, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

/** "progress-2026-10-13.xlsx" */
export const exportFileName = (base: string) => `${base}-${new Date().toISOString().slice(0, 10)}.xlsx`;
