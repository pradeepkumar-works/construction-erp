/** Data export and company deletion. */

/** Days between an admin asking for the company to be deleted and the data being erased; the request can be cancelled until then. */
export const DELETION_GRACE_DAYS = 30;

/** One table of the company's data and how many rows it has. */
export interface CompanyExportTableDto {
  /** The table's name, also the Excel file name in the export */
  name: string;
  rows: number;
}

/** What a full export will contain. */
export interface CompanyExportManifestDto {
  organizationName: string;
  tables: CompanyExportTableDto[];
  files: number;
  fileBytes: number;
}

/** A page of one table: column names and the rows as plain values (dates ISO, money and quantities as strings). */
export interface CompanyExportPageDto {
  name: string;
  columns: string[];
  rows: (string | number | boolean | null)[][];
  total: number;
}

/** An uploaded file (photo, scan) with the folder it goes in: the kind of record it is attached to. */
export interface CompanyExportFileDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  folder: string;
  createdAt: string;
}

export interface CompanyDeletionDto {
  requestedAt: string | null;
  requestedByName: string | null;
  /** The day the data is erased (YYYY-MM-DD), null when no deletion is pending */
  scheduledFor: string | null;
  /** The demo company cannot be deleted */
  protected: boolean;
}
