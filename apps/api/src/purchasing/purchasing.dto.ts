import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  EXPENSE_CATEGORIES,
  LIST_SORT_FIELDS,
  SUBMISSION_STATUSES,
  VENDOR_BILL_KINDS,
  type ExpenseCategory,
  type PurchaseOrderSortField,
  type SubmissionStatus,
  type VendorBillKind,
  type VendorBillSortField,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const nullable = () => ValidateIf((_, v) => v !== null);

/* ---------- quotations ---------- */

export class QuotationLineInput {
  @ApiProperty({ description: 'Line of the material request quoted' }) @IsUUID() materialRequestItemId: string;
  @ApiProperty({ example: '385.00', description: 'Rate per unit before GST' }) @num() @IsNumberString() rate: string;
  @ApiPropertyOptional({ example: '28', default: '0' }) @IsOptional() @num() @IsNumberString() gstRate?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) remarks?: string | null;
}

class QuotationFields {
  @ApiPropertyOptional({ example: 'UCT/Q/2291' }) @IsOptional() @trim() @IsString() @MaxLength(60) quoteRef?: string | null;
  @ApiPropertyOptional({ example: '2026-11-15' }) @IsOptional() @nullable() @IsDateString() validUntil?: string | null;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @nullable() @IsInt() @Min(0) @Max(365) deliveryDays?: number | null;
  @ApiPropertyOptional({ example: '30 days from delivery' }) @IsOptional() @trim() @IsString() @MaxLength(200) paymentTerms?: string | null;
  @ApiPropertyOptional({ example: '2500.00' }) @IsOptional() @num() @IsNumberString() freight?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CreateQuotationDto extends QuotationFields {
  @ApiProperty({ description: 'An approved material request' }) @IsUUID() materialRequestId: string;
  @ApiProperty() @IsUUID() vendorId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() quoteDate: string;
  @ApiProperty({ type: [QuotationLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => QuotationLineInput) lines: QuotationLineInput[];
}

export class UpdateQuotationDto extends QuotationFields {
  @ApiPropertyOptional({ example: '2026-10-14' }) @IsOptional() @IsDateString() quoteDate?: string;
  @ApiPropertyOptional({ type: [QuotationLineInput], description: 'Replaces the lines' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineInput)
  lines?: QuotationLineInput[];
}

/* ---------- purchase orders ---------- */

export class PoLineInput {
  @ApiPropertyOptional({ description: 'The material request line ordered; name, unit and specification come from it' }) @IsOptional() @IsUUID() materialRequestItemId?: string;
  @ApiPropertyOptional({ example: 'Cement OPC 53' }) @IsOptional() @trim() @IsString() @MaxLength(200) itemName?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(300) specification?: string | null;
  @ApiPropertyOptional({ description: 'The make (brand) ordered, checked against the project’s approved makes' }) @IsOptional() @trim() @IsString() @MaxLength(120) make?: string | null;
  @ApiPropertyOptional({ example: 'Bag' }) @IsOptional() @trim() @IsString() @MaxLength(30) unit?: string;
  @ApiProperty({ example: '500' }) @num() @IsNumberString() quantity: string;
  @ApiProperty({ example: '385.00' }) @num() @IsNumberString() rate: string;
  @ApiPropertyOptional({ example: '28', default: '0' }) @IsOptional() @num() @IsNumberString() gstRate?: string;
}

class PoFields {
  @ApiPropertyOptional({ example: '2026-10-20' }) @IsOptional() @nullable() @IsDateString() deliveryBy?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) deliveryAddress?: string | null;
  @ApiPropertyOptional({ example: '30 days from receipt of material and invoice' }) @IsOptional() @trim() @IsString() @MaxLength(300) paymentTerms?: string | null;
  @ApiPropertyOptional({ example: 30, description: 'Days from invoice to payment; 45 at most for micro and small enterprises' }) @IsOptional() @nullable() @IsInt() @Min(0) @Max(365) paymentDays?: number | null;
  @ApiPropertyOptional({ example: '2500.00' }) @IsOptional() @num() @IsNumberString() freight?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ description: 'Why the order goes to this vendor when a complete quotation on its request was lower; needed before it is submitted' })
  @IsOptional() @trim() @IsString() @MaxLength(500) selectionReason?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Quotation or other documents' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval as well' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreatePurchaseOrderDto extends PoFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() vendorId: string;
  @ApiPropertyOptional({ example: '2026-10-14', description: 'Today when left out' }) @IsOptional() @IsDateString() poDate?: string;
  @ApiPropertyOptional({ description: 'The approved material request it orders' }) @IsOptional() @IsUUID() materialRequestId?: string;
  @ApiPropertyOptional({ description: 'The quotation it accepts (vendor and request must match)' }) @IsOptional() @IsUUID() quotationId?: string;
  @ApiProperty({ type: [PoLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PoLineInput) lines: PoLineInput[];
}

export class UpdatePurchaseOrderDto extends PoFields {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ example: '2026-10-14' }) @IsOptional() @IsDateString() poDate?: string;
  @ApiPropertyOptional({ type: [PoLineInput], description: 'Replaces the lines' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PoLineInput)
  lines?: PoLineInput[];
}

export class ClosePurchaseOrderDto {
  @ApiProperty({ example: 'Balance 40 bags not required; vendor informed' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) note: string;
}

/** Last orders of items (v5 item 95). */
export class LastRatesQuery {
  @ApiProperty({ description: 'Item name and unit as `name|unit`; repeat for several items', type: [String], example: ['Cement OPC 53|Bag'] })
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(240, { each: true })
  item: string[];
  @ApiPropertyOptional({ description: 'Leave out this order (the one being edited)' }) @IsOptional() @IsUUID() excludePoId?: string;
}

/** What other sites paid for items (item 121). */
export class RateCheckQuery extends LastRatesQuery {
  @ApiPropertyOptional({ description: 'The project ordering: its own orders are left out' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ example: '2026-10-23', description: 'The order date; the window is the 30 days before it (default today)' }) @IsOptional() @IsDateString() poDate?: string;
}

export class ListPurchaseOrdersQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() materialRequestId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Only approved orders still open (something to receive, not closed)' }) @IsOptional() @QueryBool() @IsBoolean() open?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.purchaseOrders, default: 'poDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.purchaseOrders as unknown as string[]) sortBy?: PurchaseOrderSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'From this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}

export class ReceivableOrdersQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/** The procurement status report: approved orders and what is still to be delivered. */
export class ProcurementStatusQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'LATE', 'ALL'], default: 'PENDING', description: 'PENDING = something still to come; LATE = past the delivery date' })
  @IsOptional()
  @IsIn(['PENDING', 'LATE', 'ALL'])
  show?: 'PENDING' | 'LATE' | 'ALL';
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Orders dated from' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2027-03-31', description: 'Orders dated to' }) @IsOptional() @IsDateString() to?: string;
}

/* ---------- vendor bills ---------- */

export class VendorBillLineInput {
  @ApiPropertyOptional({ description: 'PO bills: the PO line billed' }) @IsOptional() @IsUUID() purchaseOrderLineId?: string;
  @ApiPropertyOptional({ example: 'Transport of shuttering, Cuttack to site', description: 'Bills without a PO: what the line is for' })
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  description?: string;
  @ApiPropertyOptional({ example: 'trip' }) @IsOptional() @trim() @IsString() @MaxLength(20) unit?: string;
  @ApiProperty({ example: '460' }) @num() @IsNumberString() quantity: string;
  @ApiProperty({ example: '385.00' }) @num() @IsNumberString() rate: string;
  @ApiPropertyOptional({ example: '28', description: "The PO line's rate when left out (0 on a line without a PO)" }) @IsOptional() @num() @IsNumberString() gstRate?: string;
}

class VendorBillFields {
  @ApiPropertyOptional({ example: '2500.00' }) @IsOptional() @num() @IsNumberString() freight?: string;
  @ApiPropertyOptional({ example: '172', description: 'HIRE: hours, days or months the vendor bills (the approved logs when left out)' })
  @IsOptional()
  @num()
  @IsNumberString()
  hireQuantity?: string;
  @ApiPropertyOptional({ example: '1800.00', description: "HIRE: the hire rate billed (the machine's rate when left out)" }) @IsOptional() @num() @IsNumberString() hireRate?: string;
  @ApiPropertyOptional({ example: '18', description: 'HIRE: GST on the hire charge' }) @IsOptional() @num() @IsNumberString() hireGstRate?: string;
  @ApiPropertyOptional({ example: '92.50', description: 'HIRE: rate a litre at which diesel we issued to an owner-fuelled machine is recovered' })
  @IsOptional()
  @num()
  @IsNumberString()
  fuelRate?: string;
  @ApiPropertyOptional({ type: [String], description: 'SERVICE: the closed job cards billed' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) jobIds?: string[];
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES, description: 'OTHER: the cost head' }) @IsOptional() @IsIn(EXPENSE_CATEGORIES as unknown as string[]) expenseCategory?: ExpenseCategory;
  @ApiPropertyOptional({ example: '50000.00', description: 'Advance paid on the PO taken off this bill (at most what is paid and not yet taken off its other bills)' })
  @IsOptional()
  @num()
  @IsNumberString()
  advanceAdjusted?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Invoice scan' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval as well' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreateVendorBillDto extends VendorBillFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ enum: VENDOR_BILL_KINDS, default: 'PO', description: 'PO, HIRE (a hired machine and month), SERVICE (closed job cards) or OTHER' })
  @IsOptional()
  @IsIn(VENDOR_BILL_KINDS as unknown as string[])
  kind?: VendorBillKind;
  @ApiPropertyOptional({ description: 'PO: an approved purchase order' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional({ description: 'HIRE, SERVICE and OTHER: the project' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: "SERVICE and OTHER: the vendor (a hire bill's vendor is the machine's hire agency)" }) @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ description: 'HIRE: the hired machine' }) @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ example: '2026-10', description: 'HIRE: the month billed' }) @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'hireMonth is YYYY-MM' }) hireMonth?: string;
  @ApiProperty({ example: 'UCT/551' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) invoiceNo: string;
  @ApiProperty({ example: '2026-10-18' }) @IsDateString() invoiceDate: string;
  @ApiProperty({ type: [VendorBillLineInput], description: 'A hire bill may leave it empty: its hire lines come from the logs' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VendorBillLineInput)
  lines: VendorBillLineInput[];
}

export class UpdateVendorBillDto extends VendorBillFields {
  @ApiPropertyOptional({ example: 'UCT/551' }) @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(60) invoiceNo?: string;
  @ApiPropertyOptional({ example: '2026-10-18' }) @IsOptional() @IsDateString() invoiceDate?: string;
  @ApiPropertyOptional({ type: [VendorBillLineInput], description: 'Replaces the lines' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VendorBillLineInput)
  lines?: VendorBillLineInput[];
}

export class ListVendorBillsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ enum: VENDOR_BILL_KINDS }) @IsOptional() @IsIn(VENDOR_BILL_KINDS as unknown as string[]) kind?: VendorBillKind;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Only bills that do not match their PO' }) @IsOptional() @QueryBool() @IsBoolean() exceptions?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.vendorBills, default: 'invoiceDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.vendorBills as unknown as string[]) sortBy?: VendorBillSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Invoices dated from this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Invoices dated up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}

export class HirePreviewQuery {
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month is YYYY-MM' }) month: string;
  @ApiPropertyOptional({ description: 'The bill being edited, whose own logs count as free' }) @IsOptional() @IsUUID() billId?: string;
}

export class BillableJobsQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ description: 'The bill being edited, whose own job cards count as free' }) @IsOptional() @IsUUID() billId?: string;
}
