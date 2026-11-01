'use client';

import React from 'react';
import type { SubmissionType } from '@erp/shared';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MachineryDrawer } from '@/components/machinery/MachineryDrawer';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { MeasurementDrawer } from '@/components/measurements/MeasurementDrawer';
import { BillDrawer } from '@/components/bills/BillDrawer';
import { PurchaseOrderDrawer } from '@/components/purchasing/PurchaseOrderDrawer';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { WorkOrderDrawer } from '@/components/subcontracts/WorkOrderDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { InspectionDrawer } from '@/components/inspections/InspectionDrawer';
import { PaymentRequestDrawer } from '@/components/payables/PaymentRequestRecord';
import { SupplierChoiceDrawer } from '@/components/purchasing/SupplierChoiceRecord';

export type OpenSubmission = { type: SubmissionType; id: string } | null;

/** Any submission's record in a drawer over the current page, so a notification opens it without leaving the page. */
export function SubmissionRecordDrawer({ open, onClose }: { open: OpenSubmission; onClose: () => void }) {
  const at = (type: SubmissionType) => ({ id: open?.type === type ? open.id : null, open: open?.type === type, onClose });
  return (
    <>
      <ProgressDrawer {...at('PROGRESS')} />
      <DprDrawer {...at('DPR')} />
      <MrDrawer {...at('MATERIAL_REQUEST')} />
      <MachineryDrawer {...at('MACHINERY')} />
      <ExpenseDrawer {...at('EXPENSE')} />
      <MeasurementDrawer {...at('MEASUREMENT')} />
      <BillDrawer {...at('BILL')} />
      <PurchaseOrderDrawer {...at('PURCHASE_ORDER')} />
      <VendorBillDrawer {...at('VENDOR_BILL')} />
      <WorkOrderDrawer {...at('WORK_ORDER')} />
      <SubBillDrawer {...at('SUBCONTRACT_BILL')} />
      <InspectionDrawer {...at('INSPECTION')} />
      <PaymentRequestDrawer {...at('PAYMENT_REQUEST')} />
      <SupplierChoiceDrawer {...at('SUPPLIER_CHOICE')} />
    </>
  );
}
