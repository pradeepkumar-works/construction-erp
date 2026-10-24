'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import { SUPPLIER_CHANGE_STATUS_LABELS, SUPPLIER_DISPATCH_STATUS_LABELS, SUPPLIER_INVOICE_STAGE_LABELS, type SupplierChangeStatus, type SupplierDispatchStatus, type SupplierInvoiceStage } from '@erp/shared';
import { formatINR } from '@/lib/format';

const STAGE_COLOR: Record<SupplierInvoiceStage, string> = { SUBMITTED: 'processing', BILLED: 'blue', PAID: 'success', RETURNED: 'error', WITHDRAWN: 'default' };
const DISPATCH_COLOR: Record<SupplierDispatchStatus, string> = { ON_THE_WAY: 'processing', RECEIVED: 'success', CANCELLED: 'default' };
const CHANGE_COLOR: Record<SupplierChangeStatus, string> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

export const InvoiceStageTag = ({ stage }: { stage: SupplierInvoiceStage }) => <AppTag color={STAGE_COLOR[stage]}>{SUPPLIER_INVOICE_STAGE_LABELS[stage]}</AppTag>;
export const DispatchStatusTag = ({ status }: { status: SupplierDispatchStatus }) => <AppTag color={DISPATCH_COLOR[status]}>{SUPPLIER_DISPATCH_STATUS_LABELS[status]}</AppTag>;
export const ChangeStatusTag = ({ status }: { status: SupplierChangeStatus }) => <AppTag color={CHANGE_COLOR[status]}>{SUPPLIER_CHANGE_STATUS_LABELS[status]}</AppTag>;
export const AcceptedTag = ({ acceptedAt }: { acceptedAt: string | null }) => (acceptedAt ? <AppTag tone="success">Accepted</AppTag> : <AppTag tone="pending">To accept</AppTag>);

/** Rupees with paise, kept out of page translation. */
export const Money = ({ value }: { value: string | number | null | undefined }) => <span translate="no">{formatINR(value, true)}</span>;
