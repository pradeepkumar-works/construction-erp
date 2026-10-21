'use client';

import dayjs from 'dayjs';
import { GST_STATES, type GstInwardRowDto, type GstOutwardRowDto, type GstRegistersDto } from '@erp/shared';
import { downloadWorkbook, workbookSheet, type ExportColumn } from './exportExcel';
import { toNumber } from './format';

/** SAC of works contract and other construction services. */
export const CONSTRUCTION_SAC = '9954';

/** "21-Odisha", as the GSTR-1 offline tool writes a place of supply. */
export const placeOfSupply = (code: string | null) => (code ? `${code}-${GST_STATES[code] ?? ''}` : '');
const gstDate = (d: string) => dayjs(d).format('DD-MMM-YYYY');
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface B2csRow {
  placeOfSupply: string | null;
  rate: number;
  taxable: number;
}

/** Unregistered clients, summed by place of supply and rate (GSTR-1 table 7). */
export function b2csSummary(rows: GstOutwardRowDto[]): B2csRow[] {
  const out = new Map<string, B2csRow>();
  for (const r of rows.filter((x) => x.section === 'B2CS')) {
    const k = `${r.placeOfSupply}:${r.rate}`;
    const g = out.get(k) ?? { placeOfSupply: r.placeOfSupply, rate: toNumber(r.rate), taxable: 0 };
    g.taxable = round2(g.taxable + toNumber(r.taxable));
    out.set(k, g);
  }
  return [...out.values()];
}

export interface HsnRow {
  rate: number;
  value: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

/** Outward supplies by rate under the construction SAC (GSTR-1 table 12). */
export function hsnSummary(rows: GstOutwardRowDto[]): HsnRow[] {
  const out = new Map<number, HsnRow>();
  for (const r of rows) {
    const rate = toNumber(r.rate);
    const g = out.get(rate) ?? { rate, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    g.value = round2(g.value + toNumber(r.invoiceValue));
    g.taxable = round2(g.taxable + toNumber(r.taxable));
    g.igst = round2(g.igst + toNumber(r.igst));
    g.cgst = round2(g.cgst + toNumber(r.cgst));
    g.sgst = round2(g.sgst + toNumber(r.sgst));
    out.set(rate, g);
  }
  return [...out.values()].sort((a, b) => a.rate - b.rate);
}

// Column headers as the GSTR-1 offline tool's sheets have them.
const B2B: ExportColumn<GstOutwardRowDto>[] = [
  { header: 'GSTIN/UIN of Recipient', value: (r) => r.recipientGstin, width: 18 },
  { header: 'Receiver Name', value: (r) => r.recipientName, width: 32 },
  { header: 'Invoice Number', value: (r) => r.invoiceNo, width: 18 },
  { header: 'Invoice date', value: (r) => gstDate(r.invoiceDate), width: 12 },
  { header: 'Invoice Value', value: (r) => toNumber(r.invoiceValue) },
  { header: 'Place Of Supply', value: (r) => placeOfSupply(r.placeOfSupply), width: 18 },
  { header: 'Reverse Charge', value: () => 'N' },
  { header: 'Applicable % of Tax Rate', value: () => null },
  { header: 'Invoice Type', value: () => 'Regular B2B', width: 14 },
  { header: 'E-Commerce GSTIN', value: () => null },
  { header: 'Rate', value: (r) => toNumber(r.rate) },
  { header: 'Taxable Value', value: (r) => toNumber(r.taxable) },
  { header: 'Cess Amount', value: () => 0 },
];
const B2CS: ExportColumn<B2csRow>[] = [
  { header: 'Type', value: () => 'OE' },
  { header: 'Place Of Supply', value: (r) => placeOfSupply(r.placeOfSupply), width: 18 },
  { header: 'Applicable % of Tax Rate', value: () => null },
  { header: 'Rate', value: (r) => r.rate },
  { header: 'Taxable Value', value: (r) => r.taxable },
  { header: 'Cess Amount', value: () => 0 },
  { header: 'E-Commerce GSTIN', value: () => null },
];
const HSN: ExportColumn<HsnRow>[] = [
  { header: 'HSN', value: () => CONSTRUCTION_SAC },
  { header: 'Description', value: () => 'Construction services', width: 22 },
  { header: 'UQC', value: () => 'NA' },
  { header: 'Total Quantity', value: () => 0 },
  { header: 'Total Value', value: (r) => r.value },
  { header: 'Rate', value: (r) => r.rate },
  { header: 'Taxable Value', value: (r) => r.taxable },
  { header: 'Integrated Tax Amount', value: (r) => r.igst },
  { header: 'Central Tax Amount', value: (r) => r.cgst },
  { header: 'State/UT Tax Amount', value: (r) => r.sgst },
  { header: 'Cess Amount', value: () => 0 },
];
const SOURCE_LABELS: Record<GstInwardRowDto['source'], string> = { VENDOR_BILL: 'Vendor bill', SUBCONTRACT_BILL: 'Subcontractor bill', EXPENSE: 'Site expense', DEBIT_NOTE: 'Debit note' };
// Laid out like GSTR-2B (B2B) so the two can be matched on GSTIN and invoice number.
const INWARD: ExportColumn<GstInwardRowDto>[] = [
  { header: 'GSTIN of supplier', value: (r) => r.supplierGstin, width: 18 },
  { header: 'Trade/Legal name', value: (r) => r.supplierName, width: 30 },
  { header: 'Invoice number', value: (r) => r.invoiceNo, width: 18 },
  { header: 'Invoice Date', value: (r) => gstDate(r.invoiceDate), width: 12 },
  { header: 'Invoice Value', value: (r) => toNumber(r.invoiceValue) },
  { header: 'Rate (%)', value: (r) => toNumber(r.rate) },
  { header: 'Taxable Value', value: (r) => toNumber(r.taxable) },
  { header: 'Integrated Tax', value: (r) => toNumber(r.igst) },
  { header: 'Central Tax', value: (r) => toNumber(r.cgst) },
  { header: 'State/UT Tax', value: (r) => toNumber(r.sgst) },
  { header: 'ITC eligible', value: (r) => (r.itcEligible ? 'Yes' : 'No (no GSTIN)'), width: 14 },
  { header: 'Source', value: (r) => SOURCE_LABELS[r.source], width: 18 },
  { header: 'Nirmaan no.', value: (r) => r.ref, width: 22 },
  { header: 'Project code', value: (r) => r.projectCode, width: 14 },
  { header: 'Project', value: (r) => r.projectName, width: 30 },
];

export { SOURCE_LABELS as GST_SOURCE_LABELS };

/** One workbook: GSTR-1 b2b, b2cs and hsn sheets, and the input tax register. */
export async function downloadGstWorkbook(data: GstRegistersDto) {
  await downloadWorkbook(`gst-registers-${data.from}-to-${data.to}`, [
    workbookSheet('b2b', B2B, data.outward.filter((r) => r.section === 'B2B')),
    workbookSheet('b2cs', B2CS, b2csSummary(data.outward)),
    workbookSheet('hsn', HSN, hsnSummary(data.outward)),
    workbookSheet('input tax', INWARD, data.inward),
  ]);
}
