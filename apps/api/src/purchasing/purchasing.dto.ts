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
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, type PurchaseOrderSortField, type SubmissionStatus, type VendorBillSortField } from '@erp/shared';
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
  @ApiProperty() @IsUUID() purchaseOrderLineId: string;
  @ApiProperty({ example: '460' }) @num() @IsNumberString() quantity: string;
  @ApiProperty({ example: '385.00' }) @num() @IsNumberString() rate: string;
  @ApiPropertyOptional({ example: '28', description: "The PO line's rate when left out" }) @IsOptional() @num() @IsNumberString() gstRate?: string;
}

class VendorBillFields {
  @ApiPropertyOptional({ example: '2500.00' }) @IsOptional() @num() @IsNumberString() freight?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Invoice scan' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval as well' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreateVendorBillDto extends VendorBillFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'An approved purchase order' }) @IsUUID() purchaseOrderId: string;
  @ApiProperty({ example: 'UCT/551' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) invoiceNo: string;
  @ApiProperty({ example: '2026-10-18' }) @IsDateString() invoiceDate: string;
  @ApiProperty({ type: [VendorBillLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => VendorBillLineInput) lines: VendorBillLineInput[];
}

export class UpdateVendorBillDto extends VendorBillFields {
  @ApiPropertyOptional({ example: 'UCT/551' }) @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(60) invoiceNo?: string;
  @ApiPropertyOptional({ example: '2026-10-18' }) @IsOptional() @IsDateString() invoiceDate?: string;
  @ApiPropertyOptional({ type: [VendorBillLineInput], description: 'Replaces the lines' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VendorBillLineInput)
  lines?: VendorBillLineInput[];
}

export class ListVendorBillsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Only bills that do not match their PO' }) @IsOptional() @QueryBool() @IsBoolean() exceptions?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.vendorBills, default: 'invoiceDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.vendorBills as unknown as string[]) sortBy?: VendorBillSortField;
}
