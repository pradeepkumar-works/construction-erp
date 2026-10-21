import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIST_SORT_FIELDS, PAYMENT_REQUEST_KINDS, RECEIPT_MODES, SUBMISSION_STATUSES, type PaymentMode, type PaymentRequestKind, type PaymentRequestSortField, type SubmissionStatus, type VendorPaymentSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/** Everything but the date and amount, which a new payment must have and an edit may leave out. */
export class PaymentFieldsDto {
  @ApiPropertyOptional({ enum: RECEIPT_MODES, default: 'BANK' }) @IsOptional() @IsIn(RECEIPT_MODES as unknown as string[]) mode?: PaymentMode;
  @ApiPropertyOptional({ example: 'HDFCN26287512345', description: 'UTR, cheque or voucher number' }) @IsOptional() @trim() @IsString() @MaxLength(100) reference?: string | null;
  @ApiPropertyOptional({ example: '0', description: 'TDS deducted at payment (vendor bills only; a subcontractor bill already deducts its TDS)' }) @IsOptional() @num() @IsNumberString() tdsAmount?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CreatePaymentDto extends PaymentFieldsDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ description: 'An approved payment request to draw on; the bill or order comes from it' }) @IsOptional() @IsUUID() paymentRequestId?: string;
  @ApiPropertyOptional({ description: 'The vendor bill paid (or give subcontractBillId, or paymentRequestId)' }) @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional({ description: 'The subcontractor bill paid (or give vendorBillId, or paymentRequestId)' }) @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() paymentDate: string;
  @ApiProperty({ example: '125000.00', description: 'Paid out of the bank or cash' }) @num() @IsNumberString() amount: string;
}

export class UpdatePaymentDto extends PaymentFieldsDto {
  @ApiPropertyOptional({ example: '2026-10-20' }) @IsOptional() @IsDateString() paymentDate?: string;
  @ApiPropertyOptional({ example: '125000.00' }) @IsOptional() @num() @IsNumberString() amount?: string;
}

/** `q` matches the reference, remarks, vendor and project. */
export class ListPaymentsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional({ description: 'Payments drawing on this request' }) @IsOptional() @IsUUID() paymentRequestId?: string;
  @ApiPropertyOptional({ description: 'Advances paid against this purchase order' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional({ description: 'Advances paid against this work order' }) @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.vendorPayments, default: 'paymentDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.vendorPayments as unknown as string[]) sortBy?: VendorPaymentSortField;
}

export class PayablesQuery {
  @ApiPropertyOptional({ description: 'Only this project' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only this vendor' }) @IsOptional() @IsUUID() vendorId?: string;
}

/* ---------- payment requests (v5 item 90) ---------- */

class PaymentRequestFields {
  @ApiPropertyOptional({ enum: RECEIPT_MODES, default: 'BANK' }) @IsOptional() @IsIn(RECEIPT_MODES as unknown as string[]) mode?: PaymentMode;
  @ApiPropertyOptional({ example: '2026-10-25', nullable: true }) @IsOptional() @IsDateString() neededBy?: string | null;
  @ApiPropertyOptional({ example: 'Mobilisation advance as per the work order terms', nullable: true }) @IsOptional() @trim() @IsString() @MaxLength(1000) reason?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Proforma invoice, the vendor\'s letter' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval as well' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreatePaymentRequestDto extends PaymentRequestFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ enum: PAYMENT_REQUEST_KINDS }) @IsIn(PAYMENT_REQUEST_KINDS as unknown as string[]) kind: PaymentRequestKind;
  @ApiPropertyOptional({ description: 'BILL: an approved vendor bill (or subcontractBillId)' }) @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional({ description: 'BILL: an approved subcontractor bill (or vendorBillId)' }) @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional({ description: 'PO_ADVANCE: an approved, open purchase order' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional({ description: 'WO_ADVANCE: an approved, open work order' }) @IsOptional() @IsUUID() workOrderId?: string;
  @ApiProperty({ example: '150000.00', description: "At most what is still unpaid on the bill, or the order's value less advances already asked for" }) @num() @IsNumberString() amount: string;
}

export class UpdatePaymentRequestDto extends PaymentRequestFields {
  @ApiPropertyOptional({ example: '150000.00' }) @IsOptional() @num() @IsNumberString() amount?: string;
}

/** `q` matches the request number, the reason, the vendor, the project and the bill or order. */
export class ListPaymentRequestsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ enum: PAYMENT_REQUEST_KINDS }) @IsOptional() @IsIn(PAYMENT_REQUEST_KINDS as unknown as string[]) kind?: PaymentRequestKind;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Approved and not yet paid in full' }) @IsOptional() @QueryBool() @IsBoolean() toPay?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.paymentRequests, default: 'requestNo' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.paymentRequests as unknown as string[]) sortBy?: PaymentRequestSortField;
}
