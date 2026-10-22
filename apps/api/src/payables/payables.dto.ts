import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import {
  DEBIT_NOTE_REASONS,
  FUND_PURPOSES,
  LIST_SORT_FIELDS,
  PAYMENT_REQUEST_KINDS,
  RECEIPT_MODES,
  SUBMISSION_STATUSES,
  type DebitNoteReason,
  type DebitNoteSortField,
  type FundPurpose,
  type PaymentMode,
  type PaymentRequestKind,
  type PaymentRequestSortField,
  type SubmissionStatus,
  type VendorPaymentSortField,
} from '@erp/shared';
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
  @ApiPropertyOptional({ description: 'FUND_REQUEST: the site the money is for' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: FUND_PURPOSES, description: 'FUND_REQUEST: what the money is for' }) @IsOptional() @IsIn(FUND_PURPOSES as unknown as string[]) purpose?: FundPurpose;
  @ApiPropertyOptional({ description: "FUND_REQUEST: an active imprest at the site, to release the money into (or vendorId)" }) @IsOptional() @IsUUID() imprestId?: string;
  @ApiPropertyOptional({ description: 'FUND_REQUEST: the party to pay on account (or imprestId)' }) @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ description: 'FUND_REQUEST: the site asking, when it asks on behalf of another' }) @IsOptional() @IsUUID() raisedAtProjectId?: string | null;
  @ApiProperty({ example: '150000.00', description: "At most what is still unpaid on the bill, or the order's value less advances already asked for (a fund request has no cap)" }) @num() @IsNumberString() amount: string;
}

export class UpdatePaymentRequestDto extends PaymentRequestFields {
  @ApiPropertyOptional({ example: '150000.00' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ enum: FUND_PURPOSES, description: 'FUND_REQUEST only' }) @IsOptional() @IsIn(FUND_PURPOSES as unknown as string[]) purpose?: FundPurpose;
}

/** Release an approved fund request (v6 item 107) into its imprest: a paid advance on it. */
export class ReleaseFundsDto {
  @ApiProperty({ example: '2026-10-22' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: '50000.00', description: 'Defaults to what the request has left to release' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ enum: RECEIPT_MODES, description: "Defaults to the request's mode" }) @IsOptional() @IsIn(RECEIPT_MODES as unknown as string[]) mode?: PaymentMode;
  @ApiPropertyOptional({ example: 'UTR 4471 2290' }) @IsOptional() @trim() @IsString() @MaxLength(100) reference?: string | null;
}

/** `q` matches the request number, the reason, the vendor, the project and the bill or order. */
export class ListPaymentRequestsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ enum: PAYMENT_REQUEST_KINDS }) @IsOptional() @IsIn(PAYMENT_REQUEST_KINDS as unknown as string[]) kind?: PaymentRequestKind;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Approved and not yet paid in full' }) @IsOptional() @QueryBool() @IsBoolean() toPay?: boolean;
  @ApiPropertyOptional({ description: 'Fund requests released into this imprest' }) @IsOptional() @IsUUID() imprestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.paymentRequests, default: 'requestNo' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.paymentRequests as unknown as string[]) sortBy?: PaymentRequestSortField;
}

/* ---------- debit notes (v5 item 91) ---------- */

export class DebitNoteLineInput {
  @ApiProperty({ example: 'Cement OPC 53, 20 bags short' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) description: string;
  @ApiPropertyOptional({ example: '20', description: 'With a rate: amount = quantity × rate' }) @IsOptional() @num() @IsNumberString() quantity?: string;
  @ApiPropertyOptional({ example: 'bag' }) @IsOptional() @trim() @IsString() @MaxLength(20) unit?: string | null;
  @ApiPropertyOptional({ example: '385.00' }) @IsOptional() @num() @IsNumberString() rate?: string;
  @ApiPropertyOptional({ example: '7700.00', description: 'A lump sum, when there is no quantity and rate' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ example: '28', default: '0' }) @IsOptional() @num() @IsNumberString() gstRate?: string;
}

export class CreateDebitNoteDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ description: 'An approved vendor bill (or subcontractBillId)' }) @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional({ description: 'An approved subcontract bill (or vendorBillId)' }) @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional({ description: 'The GRN rejected at QA/QC, or the return to the supplier, it comes from' }) @IsOptional() @IsUUID() stockEntryId?: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() date: string;
  @ApiProperty({ enum: DEBIT_NOTE_REASONS }) @IsIn(DEBIT_NOTE_REASONS as unknown as string[]) reason: DebitNoteReason;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiProperty({ type: [DebitNoteLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => DebitNoteLineInput) lines: DebitNoteLineInput[];
}

export class CancelDebitNoteDto {
  @ApiProperty({ example: 'Supplier replaced the short bags' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) note: string;
}

/** `q` matches the note number, the vendor, the project and the bill. */
export class ListDebitNotesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() stockEntryId?: string;
  @ApiPropertyOptional({ enum: DEBIT_NOTE_REASONS }) @IsOptional() @IsIn(DEBIT_NOTE_REASONS as unknown as string[]) reason?: DebitNoteReason;
  @ApiPropertyOptional({ description: 'Cancelled notes too' }) @IsOptional() @QueryBool() @IsBoolean() includeCancelled?: boolean;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.debitNotes, default: 'noteNo' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.debitNotes as unknown as string[]) sortBy?: DebitNoteSortField;
}
