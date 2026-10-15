import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { VARIATION_CAUSES, VARIATION_STATUSES, type VariationCause, type VariationStatus } from '@erp/shared';
import { PageQuery } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/** A quantity change on a BOQ item (`boqItemId`), or a new item (`itemNo`, `description`, `unit`, `rate`). */
export class VariationLineInput {
  @ApiPropertyOptional({ description: 'Existing BOQ item whose quantity changes. Leave out for a new item.' }) @IsOptional() @IsUUID() boqItemId?: string;
  @ApiPropertyOptional({ example: '12.5', description: 'New item only' }) @ValidateIf((o) => !o.boqItemId) @trim() @IsString() @IsNotEmpty() @MaxLength(30) itemNo?: string;
  @ApiPropertyOptional({ description: 'New item only' }) @ValidateIf((o) => !o.boqItemId) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) description?: string;
  @ApiPropertyOptional({ example: 'cum', description: 'New item only' }) @ValidateIf((o) => !o.boqItemId) @trim() @IsString() @IsNotEmpty() @MaxLength(20) unit?: string;
  @ApiProperty({ example: '120', description: 'Quantity added; negative when omitted. A new item: its whole quantity.' }) @num() @IsNumberString() qty: string;
  @ApiPropertyOptional({ example: '5400', description: 'Proposed rate: required for a new item, and for a BOQ item that has no quantity yet (an extra item). Other items keep their BOQ rate.' })
  @IsOptional()
  @num()
  @IsNumberString()
  rate?: string;
}

export class CreateVariationDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Extra retaining wall at Km 14.2' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiProperty({ enum: VARIATION_CAUSES }) @IsIn(VARIATION_CAUSES as unknown as string[]) cause: VariationCause;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(2000) description?: string | null;
  @ApiProperty({ type: [VariationLineInput] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => VariationLineInput) lines: VariationLineInput[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

/** Anything but the project; `lines` replaces all lines. Not once the client has approved it. */
export class UpdateVariationDto extends PartialType(CreateVariationDto) {}

export class SubmitVariationDto {
  @ApiProperty({ example: '2026-10-16', description: 'Sent to the client on' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: 'NIR/RD/2026/041', description: 'Our letter reference' }) @IsOptional() @blankNull() @IsString() @MaxLength(100) ref?: string | null;
}

export class DecisionLineInput {
  @ApiProperty() @IsUUID() id: string;
  @ApiPropertyOptional({ description: 'Quantity the client approved (default: as claimed)' }) @IsOptional() @num() @IsNumberString() approvedQty?: string;
  @ApiPropertyOptional({ description: 'Rate the client approved, for a new or extra item (default: as proposed)' }) @IsOptional() @num() @IsNumberString() approvedRate?: string;
}

export class DecideVariationDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @ApiProperty({ example: '2026-10-25' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: 'EE/RD/KHD/2026/233', description: "Client's order or letter" }) @IsOptional() @blankNull() @IsString() @MaxLength(100) clientRef?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ type: [DecisionLineInput], description: 'Approval only: what the client allowed per line' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionLineInput)
  lines?: DecisionLineInput[];
}

/** `q` matches the title and the line items. */
export class ListVariationsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: VARIATION_STATUSES }) @IsOptional() @IsIn(VARIATION_STATUSES as unknown as string[]) status?: VariationStatus;
  @ApiPropertyOptional({ enum: ['varNo', 'createdAt', 'claimedAmount'], default: 'createdAt' }) @IsOptional() @IsIn(['varNo', 'createdAt', 'claimedAmount']) sortBy?: 'varNo' | 'createdAt' | 'claimedAmount';
}

export class VariationSummaryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
