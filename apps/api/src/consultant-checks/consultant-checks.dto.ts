import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { CHECK_LEVELS, SITE_ORDER_STATUSES, type CheckLevel, type SiteOrderStatus } from '@erp/shared';
import { IsQuantity } from '../common/quantity';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CheckMeasurementDto {
  @ApiProperty({ example: '172.500', description: "The checker's own quantity for the sheet, in the BOQ item's unit" }) @IsQuantity({ zero: true }) checkedQty: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Today when left out' }) @IsOptional() @IsDateString() checkedOn?: string;
  @ApiPropertyOptional({ example: 'Width at Ch 0+450 is 6.9 m, not 7.0' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
}

export class SignHiddenDto {
  @ApiPropertyOptional({ example: '24.000', description: "The quantity measured before cover-up, in the activity's unit" }) @IsOptional() @IsQuantity({ zero: true }) qty?: string | null;
  @ApiPropertyOptional({ example: 'Footing F3: bars and cover as drawing S-12; measured before the pour' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
}

export class CountersignDto {
  @ApiPropertyOptional({ example: 'Seen on site; agreed.' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
}

export class SiteOrderInputDto {
  @ApiPropertyOptional({ example: '2026-10-30', description: 'Today when left out' }) @IsOptional() @IsDateString() date?: string;
  @ApiProperty({ example: 'Provide curing for the deck slab for 14 days; hessian to be kept wet.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) instruction: string;
  @ApiPropertyOptional({ example: 'Deck slab, span 2' }) @IsOptional() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ example: '2026-11-06', description: 'Seven days after the order when left out; null for none' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() complyBy?: string | null;
}

/** Staff copying an order in from the paper book also say who wrote it. */
export class RecordSiteOrderDto extends SiteOrderInputDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Resident engineer, as signed' }) @trim() @IsString() @IsNotEmpty() @MaxLength(160) issuedByName: string;
  @ApiPropertyOptional({ enum: CHECK_LEVELS }) @IsOptional() @IsIn(CHECK_LEVELS as unknown as string[]) issuedByLevel?: CheckLevel | null;
}

export class SiteOrderReplyDto {
  @ApiProperty({ example: 'Hessian laid and kept wet from 31 Oct; curing log at site.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) reply: string;
}

export class SiteOrderCloseDto {
  @ApiPropertyOptional({ example: 'Seen at site.' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
}

export class SiteOrderReopenDto {
  @ApiProperty({ example: 'Curing log missing for 2 Nov; keep it up to date.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) note: string;
}

export class ListSiteOrdersQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ enum: SITE_ORDER_STATUSES }) @IsOptional() @IsIn(SITE_ORDER_STATUSES as unknown as string[]) status?: SiteOrderStatus;
}
