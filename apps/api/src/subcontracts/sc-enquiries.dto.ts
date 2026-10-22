import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import type { ScEnquiryStatus } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class ScEnquiryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'open (the default), awarded, cancelled or all' }) @IsOptional() @IsIn(['open', 'awarded', 'cancelled', 'all']) status?: 'open' | 'awarded' | 'cancelled' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ScItemInput {
  @ApiPropertyOptional({ description: "A BOQ item of the project; its description and unit come from it" }) @IsOptional() @IsUUID() boqItemId?: string;
  @ApiPropertyOptional({ example: 'Scaffolding, hire and erection' }) @IsOptional() @trim() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional({ example: 'LS' }) @IsOptional() @trim() @IsString() @MaxLength(30) unit?: string;
  @ApiProperty({ example: '850' }) @num() @IsNumberString({}, { message: 'Enter the quantity' }) quantity: string;
}

class ScEnquiryFields {
  @ApiPropertyOptional({ example: 'Rates include labour, scaffolding and curing; cement and steel issued free.' }) @IsOptional() @trim() @IsString() @MaxLength(4000) scope?: string | null;
  @ApiPropertyOptional({ example: '2026-11-10' }) @IsOptional() @nullable() @IsDateString({}, { message: 'Choose the last day to quote' }) closesOn?: string | null;
}

export class CreateScEnquiryDto extends ScEnquiryFields {
  @ApiProperty() @IsUUID('4', { message: 'Choose the project' }) projectId: string;
  @ApiProperty({ example: 'Brickwork and plaster, Block A' }) @trim() @IsString() @IsNotEmpty({ message: 'Say what the work is' }) @MaxLength(200) title: string;
  @ApiProperty({ type: [ScItemInput] }) @IsArray() @ArrayMinSize(1, { message: 'Add the items to price' }) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ScItemInput) items: ScItemInput[];
  @ApiPropertyOptional({ type: [String], description: 'Subcontractors asked to quote' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) vendorIds?: string[];
}

export class UpdateScEnquiryDto extends ScEnquiryFields {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Say what the work is' }) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ type: [ScItemInput], description: 'Replaces the items; only before any quote is in' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Add the items to price' })
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ScItemInput)
  items?: ScItemInput[];
}

export class InviteDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1, { message: 'Choose the subcontractors' }) @ArrayMaxSize(20) @IsUUID('all', { each: true }) vendorIds: string[];
}

export class ScRateInput {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional({ example: '4850.00', description: 'Left out (or null) where they did not quote the item' }) @IsOptional() @nullable() @num() @IsNumberString() rate?: string | null;
}

export class ScQuoteDto {
  @ApiProperty({ example: '2026-11-04' }) @IsDateString({}, { message: 'Choose the day their quote came' }) receivedOn: string;
  @ApiProperty({ example: '18' }) @num() @IsNumberString({}, { message: 'Choose their GST rate' }) gstRate: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsDateString() validUntil?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiProperty({ type: [ScRateInput] }) @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ScRateInput) rates: ScRateInput[];
}

export class AwardDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the quote to award' }) quoteId: string;
  @ApiPropertyOptional({ description: 'Needed when the quote is not the lowest' }) @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsDateString() endDate?: string | null;
  @ApiPropertyOptional({ example: '5' }) @IsOptional() @num() @IsNumberString() retentionPct?: string;
}

export class ScStatusDto {
  @ApiProperty({ enum: ['OPEN', 'CANCELLED'] }) @IsIn(['OPEN', 'CANCELLED'] satisfies ScEnquiryStatus[]) status: 'OPEN' | 'CANCELLED';
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

