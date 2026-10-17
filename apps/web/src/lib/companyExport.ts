'use client';

import type { CompanyExportFileDto, CompanyExportManifestDto, CompanyExportPageDto } from '@erp/shared';
import { PRODUCT_NAME } from '@erp/shared';
import { api, fileUrl } from './api';
import { ZipWriter } from './zip';
import { loadXlsx } from './exportExcel';

const PAGE = 1000;

export interface ExportProgress {
  /** 0 to 100 */
  percent: number;
  step: string;
}

/** Safe in a zip path on Windows and macOS. */
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'file';

/**
 * Everything the company has, as a zip built in the browser: one Excel file per table under `excel/`, every stored
 * file under `files/<kind of record>/`, and a README. Pages are fetched one at a time so no response gets large.
 */
export async function buildCompanyExport(manifest: CompanyExportManifestDto, onProgress: (p: ExportProgress) => void): Promise<{ blob: Blob; missing: number }> {
  const zip = new ZipWriter();
  const totalRows = manifest.tables.reduce((s, t) => s + t.rows, 0);
  const work = totalRows + manifest.files * 20 || 1;
  let done = 0;
  const tick = (n: number, step: string) => {
    done += n;
    onProgress({ percent: Math.min(99, Math.round((done / work) * 100)), step });
  };

  const XLSX = await loadXlsx();
  await api.post('/company-data/export/log');
  for (const t of manifest.tables) {
    const rows: CompanyExportPageDto['rows'] = [];
    let columns: string[] = [];
    for (let page = 1; ; page++) {
      const { data } = await api.get<CompanyExportPageDto>(`/company-data/export/tables/${encodeURIComponent(t.name)}`, { params: { page, pageSize: PAGE } });
      columns = data.columns;
      rows.push(...data.rows);
      tick(data.rows.length, `Table ${t.name}`);
      if (rows.length >= data.total || data.rows.length === 0) break;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows]), t.name.slice(0, 31));
    zip.add(`excel/${t.name}.xlsx`, new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer));
  }

  let missing = 0;
  for (let page = 1; ; page++) {
    const { data } = await api.get<{ total: number; items: CompanyExportFileDto[] }>('/company-data/export/files', { params: { page, pageSize: PAGE } });
    for (const f of data.items) {
      try {
        const res = await fetch(fileUrl(f.url));
        if (!res.ok) throw new Error(String(res.status));
        zip.add(`files/${safe(f.folder)}/${safe(f.fileName)}`, new Uint8Array(await res.arrayBuffer()), new Date(f.createdAt));
      } catch {
        missing++;
      }
      tick(20, `File ${f.fileName}`);
    }
    if (page * PAGE >= data.total || data.items.length === 0) break;
  }

  const readme = [
    `${manifest.organizationName}: all data, exported from ${PRODUCT_NAME} on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'excel/  One Excel file per table. Columns are as stored: ids link rows across files (projectId is the id in Project.xlsx),',
    '        money and quantities are exact decimals, dates are YYYY-MM-DD and times are UTC.',
    'files/  Photos and documents, in a folder named after the kind of record they belong to.',
    '',
    ...manifest.tables.map((t) => `${t.name}: ${t.rows} rows`),
    `Files: ${manifest.files}${missing ? ` (${missing} could not be downloaded)` : ''}`,
  ].join('\r\n');
  zip.add('README.txt', new TextEncoder().encode(readme));
  onProgress({ percent: 100, step: 'Done' });
  return { blob: zip.finish(), missing };
}
