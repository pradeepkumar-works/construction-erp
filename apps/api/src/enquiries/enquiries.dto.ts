import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

export class CreateEnquiryDto {
  @ApiProperty({ type: [String], description: 'Vendors to ask; each gets its own link (emailed when the vendor has an email)' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsUUID('all', { each: true })
  vendorIds: string[];
  @ApiProperty({ example: '2026-10-24', description: 'Last day to quote; the links stop working after it' }) @IsDateString() @dateOnly() closesOn: string;
  @ApiPropertyOptional({ example: 'Delivery to the Bhubaneswar site, unloading by you.' }) @IsOptional() @IsString() @trim() @MaxLength(1000) message?: string | null;
}

export class PublicQuoteLineDto {
  @ApiProperty() @IsUUID() materialRequestItemId: string;
  @ApiProperty({ example: '385.00', description: 'Rate per unit before GST' }) @num() @IsNumberString() rate: string;
  @ApiProperty({ example: '18' }) @num() @IsNumberString() gstRate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MaxLength(300) remarks?: string;
}

export class PublicQuoteDto {
  @ApiPropertyOptional({ example: 'MT/Q/118' }) @IsOptional() @IsString() @trim() @MaxLength(60) quoteRef?: string;
  @ApiPropertyOptional({ example: '2026-11-15' }) @IsOptional() @IsDateString() @dateOnly() validUntil?: string;
  @ApiPropertyOptional({ example: 3 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) deliveryDays?: number;
  @ApiPropertyOptional({ example: '30 days from delivery' }) @IsOptional() @IsString() @trim() @MaxLength(200) paymentTerms?: string;
  @ApiPropertyOptional({ example: '1500' }) @IsOptional() @num() @IsNumberString() freight?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @trim() @MaxLength(1000) remarks?: string;

  @ApiProperty({ type: [PublicQuoteLineDto], description: 'The items quoted; leave out any not supplied' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PublicQuoteLineDto)
  lines: PublicQuoteLineDto[];
}
