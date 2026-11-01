'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import type { BookSource, BookVoucherStatus, BookVoucherType } from '@erp/shared';
import { BOOK_SOURCE_LABELS, BOOK_VOUCHER_STATUS_LABELS, BOOK_VOUCHER_TYPE_LABELS } from '@erp/shared';

import { Money } from '@/components/common/Money';

export const VoucherStatusTag = ({ status }: { status: BookVoucherStatus }) => <AppTag kind="bookVoucher" status={status}>{BOOK_VOUCHER_STATUS_LABELS[status]}</AppTag>;
export const VoucherTypeTag = ({ type }: { type: BookVoucherType }) => <AppTag variant="kind">{BOOK_VOUCHER_TYPE_LABELS[type]}</AppTag>;

/** A balance as Tally shows it: the amount with Dr or Cr. */
export function Balance({ value }: { value: string | number }) {
  const n = Number(value);
  if (!n) return <Money value={0} paise />;
  return (
    <>
      <Money value={Math.abs(n)} paise /> {n > 0 ? 'Dr' : 'Cr'}
    </>
  );
}

/** Where a posted voucher came from, as a link to its record when the record has a page. */
export function sourceHref(source: BookSource, sourceId: string | null): string | null {
  if (!sourceId && source !== 'OPENING') return null;
  switch (source) {
    case 'SALES':
      return `/bills/${sourceId}`;
    case 'PURCHASE':
      return `/vendor-bills/${sourceId}`;
    case 'SUBCONTRACT':
      return `/subcontract-bills/${sourceId}`;
    case 'EXPENSE':
      return `/expenses/${sourceId}`;
    case 'SALARY':
    case 'SALARY_PAYMENT':
      return '/payroll?tab=runs';
    case 'STAFF_LOAN':
      return '/payroll?tab=loans';
    case 'RECEIPT':
      return '/receivables';
    case 'PAYMENT':
    case 'DEBIT_NOTE':
      return '/payables';
    case 'RMC_SALE':
    case 'RMC_RECEIPT':
      return '/rmc?tab=bills';
    case 'MACHINE_LOAN':
    case 'LOAN_EMI':
      // An EMI's page is its loan's (the API finds the loan by either id).
      return `/machine-loans/${sourceId}`;
    case 'OPENING':
    case 'YEAR_CLOSE':
      return '/statements?tab=year';
    default:
      return null;
  }
}

export const sourceLabel = (source: BookSource) => BOOK_SOURCE_LABELS[source];
