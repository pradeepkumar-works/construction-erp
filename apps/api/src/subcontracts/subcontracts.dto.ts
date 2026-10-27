import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsQuantity } from '../common/quantity';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, type SubcontractBillSortField, type SubmissionStatus, type WorkOrderSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const nullable = () => ValidateIf((_, v) => v !== null);

/* ---------- work orders ---------- */

export class WoLineInput {
  @ApiPropertyOptional({ description: 'A BOQ item of the project; description and unit come from it, and their work on it is measured in the measurement book' })
  @IsOptional()
  @IsUUID()
  boqItemId?: string;
  @ApiPropertyOptional({ example: 'Scaffolding, hire and erection', description: "The work order's own item (no BOQ item)" }) @IsOptional() @trim() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional({ example: 'LS' }) @IsOptional() @trim() @IsString() @MaxLength(30) unit?: string;
  @ApiProperty({ example: '1200' }) @num() @IsQuantity() quantity: string;
  @ApiProperty({ example: '310.00', description: 'Rate per unit before GST' }) @num() @IsNumberString() rate: string;
}

class WoFields {
  @ApiPropertyOptional({ example: '2026-10-20' }) @IsOptional() @nullable() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ example: '2027-03-31' }) @IsOptional() @nullable() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional({ example: '18', description: 'GST on their bills; 0 for an unregistered contractor' }) @IsOptional() @num() @IsNumberString() gstRate?: string;
  @ApiPropertyOptional({ example: '5' }) @IsOptional() @num() @IsNumberString() retentionPct?: string;
  @ApiPropertyOptional({ example: '50000.00', description: 'Mobilisation advance paid to them' }) @IsOptional() @num() @IsNumberString() advanceAmount?: string;
  @ApiPropertyOptional({ example: '10' }) @IsOptional() @num() @IsNumberString() advanceRecoveryPct?: string;
  @ApiPropertyOptional({ example: '1', description: 'TDS under section 194C; defaults to 1% for an individual or HUF PAN, else 2%' }) @IsOptional() @num() @IsNumberString() tdsPct?: string;
  @ApiPropertyOptional({ example: 30, description: 'Days from their bill to payment; 45 at most for micro and small enterprises' }) @IsOptional() @nullable() @IsInt() @Min(0) @Max(365) paymentDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) terms?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval as well' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreateWorkOrderDto extends WoFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ description: 'A subcontractor or labour contractor in the vendor master' }) @IsUUID() vendorId: string;
  @ApiPropertyOptional({ example: '2026-10-14', description: 'Today when left out' }) @IsOptional() @IsDateString() woDate?: string;
  @ApiProperty({ example: 'Brickwork and plaster, Block A' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty({ type: [WoLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => WoLineInput) lines: WoLineInput[];
}

export class UpdateWorkOrderDto extends WoFields {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() woDate?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @ApiPropertyOptional({ type: [WoLineInput], description: 'Replaces the lines' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WoLineInput)
  lines?: WoLineInput[];
}

export class CloseWorkOrderDto {
  @ApiProperty({ example: 'Work complete; final bill paid' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) note: string;
}

export class ListWorkOrdersQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Only approved orders that are not closed' }) @IsOptional() @QueryBool() @IsBoolean() open?: boolean;
  @ApiPropertyOptional({ description: 'Only orders with a line on this BOQ item' }) @IsOptional() @IsUUID() boqItemId?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.workOrders, default: 'woDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.workOrders as unknown as string[]) sortBy?: WorkOrderSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Orders dated from this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Orders dated up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}

export class MarginQuery {
  @ApiProperty() @IsUUID() projectId: string;
}

/* ---------- subcontractor bills ---------- */

export class OwnItemQtyInput {
  @ApiProperty({ description: "A work order line without a BOQ item (its quantity is not measured)" }) @IsUUID() workOrderLineId: string;
  @ApiProperty({ example: '1', description: 'Quantity in this bill' }) @num() @IsQuantity() quantity: string;
}

class SubBillFields {
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isFinal?: boolean;
  @ApiPropertyOptional({ example: 'SC/24-25/017', description: "The subcontractor's own invoice number" }) @IsOptional() @trim() @IsString() @MaxLength(60) invoiceNo?: string | null;
  @ApiPropertyOptional({ example: '0', description: 'Any other recovery (₹)' }) @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [OwnItemQtyInput], description: "Quantities in this bill for the work order's own items; BOQ items come from approved measurements" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OwnItemQtyInput)
  quantities?: OwnItemQtyInput[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class CreateSubcontractBillDto extends SubBillFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'An approved, open work order' }) @IsUUID() workOrderId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() billDate: string;
  @ApiPropertyOptional({ example: '2026-10-13', description: 'Approved measurements and material issues up to this day (default the bill date)' }) @IsOptional() @IsDateString() measuredUpTo?: string;
}

export class UpdateSubcontractBillDto extends SubBillFields {
  @ApiPropertyOptional() @IsOptional() @IsDateString() billDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() measuredUpTo?: string;
}

export class ListSubcontractBillsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.subcontractBills, default: 'billDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.subcontractBills as unknown as string[]) sortBy?: SubcontractBillSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Bills dated from this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Bills dated up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}
