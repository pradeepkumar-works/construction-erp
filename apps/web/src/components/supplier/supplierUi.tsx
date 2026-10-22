'use client';

import React from 'react';
import { Tag } from 'antd';
import { SUPPLIER_CHANGE_STATUS_LABELS, SUPPLIER_DISPATCH_STATUS_LABELS, SUPPLIER_INVOICE_STAGE_LABELS, type SupplierChangeStatus, type SupplierDispatchStatus, type SupplierInvoiceStage } from '@erp/shared';
import { formatINR } from '@/lib/format';

const STAGE_COLOR: Record<SupplierInvoiceStage, string> = { SUBMITTED: 'processing', BILLED: 'blue', PAID: 'success', RETURNED: 'error', WITHDRAWN: 'default' };
const DISPATCH_COLOR: Record<SupplierDispatchStatus, string> = { ON_THE_WAY: 'processing', RECEIVED: 'success', CANCELLED: 'default' };
const CHANGE_COLOR: Record<SupplierChangeStatus, string> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

export const InvoiceStageTag = ({ stage }: { stage: SupplierInvoiceStage }) => <Tag color={STAGE_COLOR[stage]}>{SUPPLIER_INVOICE_STAGE_LABELS[stage]}</Tag>;
export const DispatchStatusTag = ({ status }: { status: SupplierDispatchStatus }) => <Tag color={DISPATCH_COLOR[status]}>{SUPPLIER_DISPATCH_STATUS_LABELS[status]}</Tag>;
export const ChangeStatusTag = ({ status }: { status: SupplierChangeStatus }) => <Tag color={CHANGE_COLOR[status]}>{SUPPLIER_CHANGE_STATUS_LABELS[status]}</Tag>;
export const AcceptedTag = ({ acceptedAt }: { acceptedAt: string | null }) => (acceptedAt ? <Tag color="success">Accepted</Tag> : <Tag color="warning">To accept</Tag>);

/** Rupees with paise, kept out of page translation. */
export const Money = ({ value }: { value: string | number | null | undefined }) => <span translate="no">{formatINR(value, true)}</span>;
