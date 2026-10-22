import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { GSTIN_PATTERN, IFSC_PATTERN, MSME_CATEGORIES, PAN_PATTERN, SUPPLIER_CHANGE_STATUSES, SUPPLIER_INVOICE_STAGES, UDYAM_PATTERN, type MsmeCategory, type SupplierChangeStatus, type SupplierInvoiceStage } from '@erp/shared';
import { QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() || null : value));
const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class AcceptOrderDto {
  @ApiPropertyOptional({ example: 'Will deliver in two lots, first on the 25th' }) @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(500) note?: string | null;
}

export class DispatchLineInput {
  @ApiProperty() @IsUUID('4', { message: 'Choose the item' }) purchaseOrderLineId: string;
  @ApiProperty({ example: 200 }) @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the quantity sent' }) @Min(0.001, { message: 'Enter the quantity sent' }) @Max(10_000_000) quantity: number;
}

/** A dispatch note: what the supplier sent against one of their purchase orders. */
export class CreateDispatchDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the purchase order' }) purchaseOrderId: string;
  @ApiProperty({ example: 'DC/2026/118', description: 'Your challan or dispatch number' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter your challan number' }) @MaxLength(40) dispatchNo: string;
  @ApiProperty({ example: '2026-10-22' }) @IsDateString({}, { message: 'Choose the date sent' }) date: string;
  @ApiPropertyOptional({ example: 'OD02AB1234' }) @IsOptional() @upper() @nullable() @IsString() @MaxLength(20) vehicleNo?: string | null;
  @ApiPropertyOptional({ example: 'LR-55102' }) @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(40) lrNo?: string | null;
  @ApiPropertyOptional({ example: 'Kalinga Roadways' }) @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(120) transporter?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(500) remarks?: string | null;
  @ApiProperty({ type: [DispatchLineInput] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Enter the quantity sent on at least one line' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DispatchLineInput)
  lines: DispatchLineInput[];
}

/** An invoice sent on the portal: a PDF or photo of it, against a purchase order or work order, or neither. */
export class CreateSupplierInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @nullable() @IsUUID() purchaseOrderId?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsUUID() workOrderId?: string | null;
  @ApiProperty({ example: 'MTT/2026/0412' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the invoice number' }) @MaxLength(60) invoiceNo: string;
  @ApiProperty({ example: '2026-10-21' }) @IsDateString({}, { message: 'Choose the invoice date' }) invoiceDate: string;
  @ApiProperty({ example: 118000, description: 'With GST' }) @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter the invoice amount' }) @Min(0.01, { message: 'Enter the invoice amount' }) @Max(10_000_000_000) amount: number;
  @ApiPropertyOptional({ example: 18000 }) @IsOptional() @nullable() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000_000) gstAmount?: number | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(1000) notes?: string | null;
  @ApiProperty({ type: [String], description: 'The invoice, uploaded first (POST /uploads)' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Attach the invoice' })
  @ArrayMaxSize(5)
  @IsUUID('4', { each: true })
  attachmentIds: string[];
}

export class StatementQuery {
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Lines from this day; earlier ones are carried in the opening balance' }) @IsOptional() @IsDateString() from?: string;
}

/** The details a supplier asks to change: a field left out stays as it is; an empty one is cleared. */
export class SupplierChangeInput {
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(120) contactPerson?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsEmail({}, { message: 'Enter an email like name@example.com' }) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(40) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(500) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21ABCPT1234F1Z9' }) gstin?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like ABCPT1234F' }) pan?: string | null;
  @ApiPropertyOptional({ enum: MSME_CATEGORIES }) @IsOptional() @nullable() @IsIn(MSME_CATEGORIES as unknown as string[]) msmeCategory?: MsmeCategory | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(UDYAM_PATTERN, { message: 'Udyam number looks like UDYAM-OD-19-0012345' }) udyamNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(200) bankAccountName?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(/^[0-9A-Z]{6,20}$/, { message: 'Account number is 6 to 20 letters or digits' }) bankAccountNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(IFSC_PATTERN, { message: 'IFSC is 11 characters, like SBIN0001234' }) bankIfsc?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(200) bankName?: string | null;
  @ApiPropertyOptional({ description: 'A word for whoever approves it' }) @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(500) note?: string | null;
}

/* ---------- the company's side ---------- */

export class InviteSupplierDto {
  @ApiProperty({ example: 'Bikash Sahu' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter their name' }) @MaxLength(120) fullName: string;
  @ApiProperty({ example: 'accounts@maatarini.in' }) @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)) @IsEmail({}, { message: 'Enter an email like name@example.com' }) email: string;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(40) phone?: string | null;
}

export class SetLoginActiveDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}

export class InvoiceInboxQuery {
  @ApiPropertyOptional({ enum: SUPPLIER_INVOICE_STAGES, description: 'With accounts when left out' }) @IsOptional() @IsIn(SUPPLIER_INVOICE_STAGES as unknown as string[]) stage?: SupplierInvoiceStage;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ description: 'Every stage' }) @IsOptional() @QueryBool() @IsBoolean() all?: boolean;
}

export class ReturnInvoiceDto {
  @ApiProperty({ example: 'GST number on the invoice is not ours; send a corrected one' }) @trim() @IsString() @IsNotEmpty({ message: 'Say why it is returned, so the supplier can fix it' }) @MaxLength(500) note: string;
}

export class ChangeQuery {
  @ApiPropertyOptional({ enum: SUPPLIER_CHANGE_STATUSES, description: 'Waiting ones when left out' }) @IsOptional() @IsIn(SUPPLIER_CHANGE_STATUSES as unknown as string[]) status?: SupplierChangeStatus;
}

export class DecideChangeDto {
  @ApiProperty() @IsBoolean() approve: boolean;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsString() @MaxLength(500) note?: string | null;
}
