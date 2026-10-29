import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { IsQuantity } from '../common/quantity';
import { VENDOR_ID_DOC } from '../vendors/vendors.dto';
import { GRN_QC_STATUSES, LIST_SORT_FIELDS, RECEIPT_WAITS, type ReceiptWait, PIPE_MATERIALS, STOCK_ADJUSTMENT_REASONS, STOCK_ENTRY_TYPES, type GrnQcStatus, type PipeMaterial, type StockAdjustmentReason, type ItemSortField, type StockBalanceSortField, type StockEntrySortField, type StockEntryType } from '@erp/shared';
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
  @ApiProperty({ example: '250' }) @qty() @IsQuantity() quantity: string;
}

export class CreateReceiptDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ description: 'An approved material request. Send this or `purchaseOrderId`.' })
  @ValidateIf((o: CreateReceiptDto) => !o.purchaseOrderId)
  @IsUUID()
  materialRequestId?: string;
  @ApiPropertyOptional({ description: 'An approved, open purchase order; the supplier is its vendor' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
  @ApiPropertyOptional({ description: "With purchaseOrderId: the supplier's dispatch note this GRN receives (supplier portal)" }) @IsOptional() @IsUUID() supplierDispatchId?: string;
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
  @ApiProperty({ example: '40' }) @qty() @IsQuantity() quantity: string;
}

export class CreateIssueDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'Kalinga Builders (slab gang)', description: 'Who took the material; the contractor when left out with a work order' })
  @ValidateIf((o: CreateIssueDto) => !o.workOrderId || o.issuedTo != null)
  @IsString()
  @trim()
  @MinLength(1)
  @MaxLength(200)
  issuedTo?: string;
  @ApiPropertyOptional({ description: "Material for a subcontractor's work: their approved, open work order. It is recovered from their next bill." })
  @IsOptional()
  @IsUUID()
  workOrderId?: string;
  @ApiPropertyOptional({ description: 'Activity the material is used for' }) @IsOptional() @IsUUID() activityId?: string | null;
  @ApiPropertyOptional({ description: "Component or pipe zone the material goes to (item 128); the activity's own when an activity is given" }) @IsOptional() @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [IssueLineDto], description: 'Each quantity may not exceed the stock at the project.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

/* ---------- fuel ---------- */

/** Fuel from the store into one machine (v5 item 93). */
export class CreateFuelIssueDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiProperty({ description: 'The machine fuelled; an active machine of the company' }) @IsUUID() equipmentId: string;
  @ApiProperty({ description: 'A fuel item of the item master (isFuel)' }) @IsUUID() itemId: string;
  @ApiProperty({ example: '120', description: 'Litres (in the item unit); at most the stock at the project' }) @qty() @IsQuantity() quantity: string;
  @ApiPropertyOptional({ example: '2154.5', description: 'Hour meter or odometer when fuelled' })
  @IsOptional()
  @qty()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  meterReading?: string | null;
  @ApiPropertyOptional({ example: 'Ramesh (operator)', description: 'Who took it; the machine when left out' }) @IsOptional() @IsString() @trim() @MaxLength(200) issuedTo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
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
  @ApiProperty({ example: 'Opening stock as on 1 Oct', description: 'What happened, required' }) @IsString() @trim() @MinLength(3) @MaxLength(1000) remarks: string;
  @ApiPropertyOptional({ enum: STOCK_ADJUSTMENT_REASONS, description: 'Why (v5 item 92): opening stock, or a loss or gain the wastage report counts. Left out on older phone builds.' })
  @IsOptional() @IsIn(STOCK_ADJUSTMENT_REASONS) reason?: StockAdjustmentReason;

  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

/* ---------- transfers, returns and counts ---------- */

export class CreateTransferDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'The project the material leaves' }) @IsUUID() projectId: string;
  @ApiProperty({ description: 'The project it goes to (same organisation)' }) @IsUUID() toProjectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'OD-02-AB-1234' }) @IsOptional() @IsString() @trim() @MaxLength(30) vehicleNo?: string | null;
  @ApiPropertyOptional({ example: 'DC-221' }) @IsOptional() @IsString() @trim() @MaxLength(60) challanNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [IssueLineDto], description: 'Each quantity may not exceed the stock at the sending project.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

/* ---------- a material request met from stock (v5 item 95) ---------- */

export class CoverLineDto {
  @ApiProperty() @IsUUID() materialRequestItemId: string;
  @ApiProperty({ example: '20' }) @qty() @IsQuantity() quantity: string;
}

export class CoverRequestDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: "The site the material comes from: the request's own site issues it, another site transfers it" }) @IsUUID() fromProjectId: string;
  @ApiProperty({ example: '2026-10-21' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'OD-02-AB-1234' }) @IsOptional() @IsString() @trim() @MaxLength(30) vehicleNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [CoverLineDto], description: 'Each at most what the line still needs and what the sending site holds.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CoverLineDto)
  lines: CoverLineDto[];
}

export class ReceiveTransferDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CreateVendorReturnDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'Maa Tarini Traders' }) @IsOptional() @IsString() @trim() @MaxLength(200) supplier?: string | null;
  @ApiPropertyOptional(VENDOR_ID_DOC) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ example: 'DN-14', description: 'Our debit note or return challan' }) @IsOptional() @IsString() @trim() @MaxLength(60) challanNo?: string | null;
  @ApiPropertyOptional({ example: 'OD-02-AB-1234' }) @IsOptional() @IsString() @trim() @MaxLength(30) vehicleNo?: string | null;
  @ApiProperty({ example: '40 bags set hard in the rain', description: 'Reason, required' }) @IsString() @trim() @MinLength(3) @MaxLength(1000) remarks: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('all', { each: true }) attachmentIds?: string[];

  @ApiProperty({ type: [IssueLineDto], description: 'Each quantity may not exceed the stock at the project.' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

export class CreateSiteReturnDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiProperty({ example: 'Kalinga Builders (slab gang)', description: 'Who brought the material back' }) @IsString() @trim() @MinLength(1) @MaxLength(200) issuedTo: string;
  @ApiPropertyOptional({ description: 'Activity it had been issued for' }) @IsOptional() @IsUUID() activityId?: string | null;
  @ApiPropertyOptional({ description: "Component or pipe zone it had been issued to (item 128); the activity's own when an activity is given" }) @IsOptional() @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [IssueLineDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => IssueLineDto)
  lines: IssueLineDto[];
}

export class CountLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '1180', description: 'Quantity counted on the shelf' }) @qty() @IsNumberString() countedQty: string;
}

export class PostCountDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional({ example: 'Month-end count by the store keeper and the PM' }) @IsOptional() @IsString() @MaxLength(800) remarks?: string | null;

  @ApiProperty({ type: [CountLineDto], description: 'Items counted; items left out are not touched' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => CountLineDto)
  lines: CountLineDto[];
}

export class IncomingTransfersQuery {
  @ApiPropertyOptional({ description: 'Transfers going to this project' }) @IsOptional() @IsUUID() projectId?: string;
}

export class StockValuationQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/* ---------- lists ---------- */

/** `q` matches entry number, project, supplier, challan, issued to, remarks, request number and item names. */
export class ListStockEntriesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: STOCK_ENTRY_TYPES }) @IsOptional() @IsIn(STOCK_ENTRY_TYPES as unknown as string[]) type?: StockEntryType;
  @ApiPropertyOptional({ description: 'Entries that move this item' }) @IsOptional() @IsUUID() itemId?: string;
  @ApiPropertyOptional({ description: 'Receipts against this material request' }) @IsOptional() @IsUUID() materialRequestId?: string;
  @ApiPropertyOptional({ description: 'Issues against this work order' }) @IsOptional() @IsUUID() workOrderId?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() @dateOnly() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() @dateOnly() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.stockEntries, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.stockEntries as unknown as string[]) sortBy?: StockEntrySortField;
  @ApiPropertyOptional({ description: 'Include transfers and returns. Left out, only receipts, issues and adjustments are listed (what older phone builds can show).' })
  @IsOptional()
  @QueryBool()
  @IsBoolean()
  allTypes?: boolean;
  @ApiPropertyOptional({ enum: ['PENDING', ...GRN_QC_STATUSES], description: 'Receipts by QA/QC check: PENDING = not checked yet' })
  @IsOptional()
  @IsIn(['PENDING', ...GRN_QC_STATUSES])
  qc?: GrnQcStatus | 'PENDING';
  @ApiPropertyOptional({ enum: RECEIPT_WAITS, description: 'Receipts waiting on a desk: CHECK (QA/QC), BILL (a supplier bill to match) or DEBIT_NOTE (rejected or returned, no debit note)' })
  @IsOptional()
  @IsIn(RECEIPT_WAITS as unknown as string[])
  waiting?: ReceiptWait;
}

/** `q` matches item name, category and project. */
export class ListStockBalancesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only items below their minimum level' }) @IsOptional() @QueryBool() @IsBoolean() lowOnly?: boolean;
  @ApiPropertyOptional({ description: 'Only items with stock on hand (balance above zero)' }) @IsOptional() @QueryBool() @IsBoolean() inStock?: boolean;
  @ApiPropertyOptional({ description: 'Only fuel items (v5 item 93)' }) @IsOptional() @QueryBool() @IsBoolean() fuel?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.stockBalances, default: 'item' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.stockBalances as unknown as string[]) sortBy?: StockBalanceSortField;
}

export class ReceivableQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/* ---------- item master and minimum levels ---------- */

export class ListItemsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Only fuel items (v5 item 93)' }) @IsOptional() @QueryBool() @IsBoolean() fuel?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.items, default: 'name' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.items as unknown as string[]) sortBy?: ItemSortField;
}

export class CreateItemDto {
  @ApiProperty({ example: 'OPC 53 Grade Cement' }) @IsString() @trim() @MinLength(1) @MaxLength(200) name: string;
  @ApiProperty({ example: 'Bags' }) @IsString() @trim() @MinLength(1) @MaxLength(30) unit: string;
  @ApiPropertyOptional({ example: 'Cement' }) @IsOptional() @IsString() @trim() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ example: '395.00', description: 'Standard rate per unit; values issues in the cost view' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() rate?: string | null;
  @ApiPropertyOptional({ description: 'Diesel, petrol and the like: issued to machines and in the daily fuel position (v5 item 93)' }) @IsOptional() @IsBoolean() isFuel?: boolean;
  @ApiPropertyOptional({ example: 110, description: 'Pipe (item 128): the outside or nominal diameter it lays as, when the name does not say it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(15) @Max(4000) pipeDiameterMm?: number | null;
  @ApiPropertyOptional({ enum: PIPE_MATERIALS, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(PIPE_MATERIALS) pipeMaterial?: PipeMaterial | null;
  @ApiPropertyOptional({ example: '42.5', description: 'Pipe bought by weight: kg per metre, to turn issues into metres' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() kgPerMetre?: string | null;
}

export class UpdateItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MinLength(1) @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MinLength(1) @MaxLength(30) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ example: '395.00' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() rate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFuel?: boolean;
  @ApiPropertyOptional({ example: 110, description: 'Pipe (item 128): the outside or nominal diameter it lays as, when the name does not say it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(15) @Max(4000) pipeDiameterMm?: number | null;
  @ApiPropertyOptional({ enum: PIPE_MATERIALS, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(PIPE_MATERIALS) pipeMaterial?: PipeMaterial | null;
  @ApiPropertyOptional({ example: '42.5', description: 'Pipe bought by weight: kg per metre, to turn issues into metres' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() kgPerMetre?: string | null;
}

/** Merge items into one (finding 3 of the October review). */
export class MergeItemsDto {
  @ApiProperty({ type: [String], description: 'Items to fold into this one; they must be in the same unit' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  fromIds: string[];
}

export class SetMinLevelDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '100', nullable: true, description: 'null or 0 removes the minimum' })
  @IsOptional() @qty() @IsNumberString() minQty: string | null;
}

class GrnQcLineDto {
  @ApiProperty({ description: 'The GRN line (stock line id)' }) @IsUUID() lineId: string;
  @ApiProperty({ example: '12.5', description: 'Quantity rejected on this line (0 for none)' }) @IsNumberString() rejectedQty: string;
}

/** QA/QC's check of a GRN. Rejected quantities go back to the supplier with a return to vendor. */
export class CheckGrnDto {
  @ApiProperty({ enum: GRN_QC_STATUSES }) @IsIn(GRN_QC_STATUSES) status: GrnQcStatus;
  @ApiPropertyOptional({ example: '20 bags lumpy, set aside for return' }) @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @ApiPropertyOptional({ example: 'TC/24/88123', description: "The maker's test certificate for the lot (item 137 part 2)" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) mtcNo?: string | null;
  @ApiPropertyOptional({ example: '2026-10-18', description: 'The date on the certificate' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() mtcDate?: string | null;
  @ApiPropertyOptional({ type: [GrnQcLineDto], description: 'Partly accepted: the rejected quantity per line' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GrnQcLineDto)
  lines?: GrnQcLineDto[];
}
