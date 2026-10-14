import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { VENDOR_ID_DOC } from '../vendors/vendors.dto';
import { LIST_SORT_FIELDS, STOCK_ENTRY_TYPES, type ItemSortField, type StockBalanceSortField, type StockEntrySortField, type StockEntryType } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = () => Matches(DATE_ONLY, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** Quantities arrive as strings (decimal-safe) but the site app may send numbers. */
const qty = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/* ---------- receipts (GRN) ---------- */

export class ReceiptLineDto {
  @ApiPropertyOptional({ description: 'Line of the approved material request being received (GRN against a request)' })
  @ValidateIf((o: ReceiptLineDto) => !o.purchaseOrderLineId)
  @IsUUID()
  materialRequestItemId?: string;
  @ApiPropertyOptional({ description: 'Line of the approved purchase order being received (GRN against a PO)' }) @IsOptional() @IsUUID() purchaseOrderLineId?: string;
  @ApiProperty({ example: '250' }) @qty() @IsNumberString() quantity: string;
}

export class CreateReceiptDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ description: 'An approved material request. Send this or `purchaseOrderId`.' })
  @ValidateIf((o: CreateReceiptDto) => !o.purchaseOrderId)
  @IsUUID()
  materialRequestId?: string;
  @ApiPropertyOptional({ description: 'An approved, open purchase order; the supplier is its vendor' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'Maa Tarini Traders' }) @IsOptional() @IsString() @trim() @MaxLength(200) supplier?: string | null;
  @ApiPropertyOptional(VENDOR_ID_DOC) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ example: 'CH-1182' }) @IsOptional() @IsString() @trim() @MaxLength(60) challanNo?: string | null;
  @ApiPropertyOptional({ example: 'OD-02-AB-1234' }) @IsOptional() @IsString() @trim() @MaxLength(30) vehicleNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Uploaded challan / invoice photos' }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];

  @ApiProperty({ type: [ReceiptLineDto], description: 'Quantities received now. Each may not exceed what is still pending on that request or PO line.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];
}

/* ---------- issues ---------- */

export class IssueLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '40' }) @qty() @IsNumberString() quantity: string;
}

export class CreateIssueDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiProperty({ example: 'Kalinga Builders (slab gang)', description: 'Who took the material' }) @IsString() @trim() @MinLength(1) @MaxLength(200) issuedTo: string;
  @ApiPropertyOptional({ description: 'Activity the material is used for' }) @IsOptional() @IsUUID() activityId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [IssueLineDto], description: 'Each quantity may not exceed the stock at the project.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

/* ---------- adjustments ---------- */

export class AdjustmentLineDto {
  @ApiPropertyOptional({ description: 'An existing item; or send itemName + unit to add one (e.g. opening stock)' })
  @IsOptional() @IsUUID() itemId?: string;
  @ApiPropertyOptional({ example: 'Diesel' }) @ValidateIf((o) => !o.itemId) @IsString() @trim() @MinLength(1) @MaxLength(200) itemName?: string;
  @ApiPropertyOptional({ example: 'Ltr' }) @ValidateIf((o) => !o.itemId) @IsString() @trim() @MinLength(1) @MaxLength(30) unit?: string;
  @ApiProperty({ example: '-12.5', description: 'Signed: positive adds stock, negative removes it' }) @qty() @IsNumberString() quantity: string;
}

export class CreateAdjustmentDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiProperty({ example: 'Opening stock as on 1 Oct', description: 'Reason, required' }) @IsString() @trim() @MinLength(3) @MaxLength(1000) remarks: string;

  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

/* ---------- lists ---------- */

/** `q` matches entry number, project, supplier, challan, issued to, remarks, request number and item names. */
export class ListStockEntriesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: STOCK_ENTRY_TYPES }) @IsOptional() @IsIn(STOCK_ENTRY_TYPES as unknown as string[]) type?: StockEntryType;
  @ApiPropertyOptional({ description: 'Entries that move this item' }) @IsOptional() @IsUUID() itemId?: string;
  @ApiPropertyOptional({ description: 'Receipts against this material request' }) @IsOptional() @IsUUID() materialRequestId?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() @dateOnly() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() @dateOnly() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.stockEntries, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.stockEntries as unknown as string[]) sortBy?: StockEntrySortField;
}

/** `q` matches item name, category and project. */
export class ListStockBalancesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only items below their minimum level' }) @IsOptional() @QueryBool() @IsBoolean() lowOnly?: boolean;
  @ApiPropertyOptional({ description: 'Only items with stock on hand (balance above zero)' }) @IsOptional() @QueryBool() @IsBoolean() inStock?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.stockBalances, default: 'item' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.stockBalances as unknown as string[]) sortBy?: StockBalanceSortField;
}

export class ReceivableQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/* ---------- item master and minimum levels ---------- */

export class ListItemsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.items, default: 'name' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.items as unknown as string[]) sortBy?: ItemSortField;
}

export class CreateItemDto {
  @ApiProperty({ example: 'OPC 53 Grade Cement' }) @IsString() @trim() @MinLength(1) @MaxLength(200) name: string;
  @ApiProperty({ example: 'Bags' }) @IsString() @trim() @MinLength(1) @MaxLength(30) unit: string;
  @ApiPropertyOptional({ example: 'Cement' }) @IsOptional() @IsString() @trim() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ example: '395.00', description: 'Standard rate per unit; values issues in the cost view' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() rate?: string | null;
}

export class UpdateItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MinLength(1) @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MinLength(1) @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ example: '395.00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() rate?: string | null;
}

export class SetMinLevelDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '100', nullable: true, description: 'null or 0 removes the minimum' })
  @IsOptional() @qty() @IsNumberString() minQty: string | null;
}
