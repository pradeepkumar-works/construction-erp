'use client';

import React from 'react';
import { Tag } from 'antd';
import type { BookSource, BookVoucherStatus, BookVoucherType } from '@erp/shared';
import { BOOK_SOURCE_LABELS, BOOK_VOUCHER_STATUS_LABELS, BOOK_VOUCHER_TYPE_LABELS } from '@erp/shared';
import { formatINR } from '@/lib/format';

const STATUS_COLOR: Record<BookVoucherStatus, string> = { DRAFT: 'default', SUBMITTED: 'processing', APPROVED: 'success', REJECTED: 'warning', CANCELLED: 'default' };
const TYPE_COLOR: Record<BookVoucherType, string> = {
  JOURNAL: 'purple',
  PAYMENT: 'volcano',
  RECEIPT: 'green',
  CONTRA: 'cyan',
  SALES: 'blue',
  PURCHASE: 'orange',
  DEBIT_NOTE: 'magenta',
  CREDIT_NOTE: 'geekblue',
};

export const VoucherStatusTag = ({ status }: { status: BookVoucherStatus }) => <Tag color={STATUS_COLOR[status]}>{BOOK_VOUCHER_STATUS_LABELS[status]}</Tag>;
export const VoucherTypeTag = ({ type }: { type: BookVoucherType }) => <Tag color={TYPE_COLOR[type]}>{BOOK_VOUCHER_TYPE_LABELS[type]}</Tag>;

/** Rupees in a table cell, kept out of translation; empty when there is none. */
export const Amount = ({ value }: { value: string | number | null | undefined }) => (value === null || value === undefined ? null : <span translate="no">{formatINR(value, true)}</span>);

/** A balance as Tally shows it: the amount with Dr or Cr. */
export function Balance({ value }: { value: string | number }) {
  const n = Number(value);
  if (!n) return <span translate="no">{formatINR(0, true)}</span>;
  return <span translate="no">{`${formatINR(Math.abs(n), true)} ${n > 0 ? 'Dr' : 'Cr'}`}</span>;
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
