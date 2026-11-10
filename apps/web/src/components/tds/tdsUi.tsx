'use client';

import React from 'react';
import type { useQueryClient } from '@tanstack/react-query';
import {
  TDS_DEDUCTION_STATE_LABELS,
  TDS_QUARTER_STATE_LABELS,
  TDS_RETURN_FORM_LABELS,
  TDS_SECTIONS,
  quarterOf,
  quarterStep,
  returnFileName,
  returnRows,
  tdsSectionsOf,
  type TdsDeductionState,
  type TdsQuarter,
  type TdsQuarterDto,
  type TdsQuarterState,
  type TdsReturnForm,
} from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { downloadWorkbook, workbookSheet } from '@/lib/exportExcel';
import { todayDate } from '@/lib/format';

export const challanHref = (id: string) => `/tds/challans/${id}`;
export const quarterHref = (form: TdsReturnForm, periodFrom: string, tab?: string) => `/tds?form=${TDS_RETURN_FORM_LABELS[form]}&q=${periodFrom}${tab ? `&tab=${tab}` : ''}`;

/** `26Q` or `24Q` in the address bar; 26Q otherwise. */
export const formOfParam = (v: string | null | undefined): TdsReturnForm => (v === '24Q' ? 'FORM_24Q' : 'FORM_26Q');

/** The quarter a page opens on: the one asked for, else the latest one ended (its return is the one to file). */
export function quarterOfParam(v: string | null | undefined, today = todayDate()): TdsQuarter {
  if (v && /^\d{4}-\d{2}-01$/.test(v)) {
    const q = quarterOf(v);
    if (q.from === v) return q;
  }
  return quarterStep(quarterOf(today), -1);
}

/** The quarter picker's choices: the running quarter and the eleven before it, newest first. */
export function quarterChoices(today = todayDate()) {
  const now = quarterOf(today);
  return Array.from({ length: 12 }, (_, i) => quarterStep(now, -i)).map((q) => ({ value: q.from, label: q.label }));
}

/** Sections a deduction of the form can take, for a picker. */
export const sectionOptions = (form: TdsReturnForm) => tdsSectionsOf(form).map((k) => ({ value: k, label: TDS_SECTIONS[k].label, title: TDS_SECTIONS[k].covers }));

/** A quarter's TDS, its challans, the payments, salary runs and subcontractor bills behind them, and the books, change together. */
export function invalidateTds(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['tds', 'vendor-payments', 'payables', 'books', 'tally']) qc.invalidateQueries({ queryKey: [k] });
}

export const DeductionStateTag = ({ state }: { state: TdsDeductionState }) => (
  <AppTag kind="tdsDeduction" status={state}>
    {TDS_DEDUCTION_STATE_LABELS[state]}
  </AppTag>
);

export const QuarterStateTag = ({ state }: { state: TdsQuarterState }) => (
  <AppTag kind="tdsQuarter" status={state}>
    {TDS_QUARTER_STATE_LABELS[state]}
  </AppTag>
);

/**
 * The quarter's return as the Return Preparation Utility takes it: one workbook with the challan sheet and the deductee
 * sheet, every cell text in the utility's columns and order. The utility checks it and makes the FVU file.
 */
export async function downloadReturnFile(q: TdsQuarterDto) {
  const { challans, deductees } = returnRows(
    q.form,
    q.challans.map((c) => ({ id: c.id, bsrCode: c.bsrCode, challanSerial: c.challanSerial, depositedOn: c.depositedOn, tax: c.tax, interest: c.interest, fee: c.fee, other: c.other, minorHead: c.minorHead })),
    q.deductions.map((d) => ({
      id: d.id,
      section: d.section,
      deducteeName: d.deducteeName,
      deducteePan: d.deducteePan,
      deducteeRef: d.deducteeRef,
      paidOn: d.paidOn,
      amountPaid: d.amountPaid,
      rate: d.rate,
      tdsAmount: d.tdsAmount,
      reason: d.reason,
      certificateNo: d.certificateNo,
      certificateBase: d.certificateBase,
      challanId: d.challanId,
    })),
  );
  const sheet = (s: { name: string; header: string[]; rows: string[][] }) =>
    workbookSheet<string[]>(
      s.name,
      s.header.map((h, i) => ({ header: h, value: (r) => r[i], width: Math.max(10, Math.min(28, h.length + 2)) })),
      s.rows,
    );
  await downloadWorkbook(returnFileName(q.tan, q.form, q.quarter), [sheet(challans), sheet(deductees)]);
}
