'use client';

import React from 'react';
import { AppTag } from '@/components/common/AppTag';
import { SUPPLIER_CHANGE_STATUS_LABELS, SUPPLIER_DISPATCH_STATUS_LABELS, SUPPLIER_INVOICE_STAGE_LABELS, type SupplierChangeStatus, type SupplierDispatchStatus, type SupplierInvoiceStage } from '@erp/shared';



export const InvoiceStageTag = ({ stage }: { stage: SupplierInvoiceStage }) => <AppTag kind="supplierInvoice" status={stage}>{SUPPLIER_INVOICE_STAGE_LABELS[stage]}</AppTag>;
export const DispatchStatusTag = ({ status }: { status: SupplierDispatchStatus }) => <AppTag kind="supplierDispatch" status={status}>{SUPPLIER_DISPATCH_STATUS_LABELS[status]}</AppTag>;
export const ChangeStatusTag = ({ status }: { status: SupplierChangeStatus }) => <AppTag kind="supplierChange" status={status}>{SUPPLIER_CHANGE_STATUS_LABELS[status]}</AppTag>;
export const AcceptedTag = ({ acceptedAt }: { acceptedAt: string | null }) => (acceptedAt ? <AppTag meaning="done">Accepted</AppTag> : <AppTag meaning="waiting">To accept</AppTag>);

