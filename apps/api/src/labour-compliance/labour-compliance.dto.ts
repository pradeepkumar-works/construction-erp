import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { LABOUR_CHALLAN_KINDS, LABOUR_PAPER_KINDS, type LabourChallanKind, type LabourPaperKind } from '@erp/shared';

const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
/** null clears an optional field on PATCH; undefined leaves it. */
const nullable = () => ValidateIf((_, v) => v !== null);

export class LabourRegisterQuery {
  @ApiPropertyOptional({ description: 'One site only' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'One contractor only' }) @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional({ default: 6, description: 'Months of head counts looked back over' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) months?: number;
}

class Attachments {
  @ApiPropertyOptional({ type: [String], description: 'Scans uploaded through /uploads; on PATCH the complete set' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class CreateLabourPaperDto extends Attachments {
  @ApiProperty() @IsUUID() vendorId!: string;
  @ApiProperty({ enum: LABOUR_PAPER_KINDS }) @IsIn(LABOUR_PAPER_KINDS) kind!: LabourPaperKind;
  @ApiPropertyOptional({ description: 'The site a labour licence is for; empty for the other papers' }) @IsOptional() @nullable() @IsUUID() projectId?: string | null;
  @ApiProperty({ example: 'ALC/BBSR/CLRA/2026/0412' }) @trim() @IsString() @MinLength(1) @MaxLength(80) number!: string;
  @ApiPropertyOptional({ example: '2026-04-01' }) @IsOptional() @nullable() @IsDateString() @dateOnly() validFrom?: string | null;
  @ApiPropertyOptional({ example: '2027-03-31' }) @IsOptional() @nullable() @IsDateString() @dateOnly() validTo?: string | null;
  @ApiPropertyOptional({ example: 60, description: 'Most workers the licence allows or the policy covers' }) @IsOptional() @nullable() @IsInt() @Min(1) @Max(100000) workers?: number | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @trim() @IsString() @MaxLength(500) note?: string | null;
}

/** Correct a paper; its contractor and kind stay. */
export class UpdateLabourPaperDto extends PartialType(OmitType(CreateLabourPaperDto, ['vendorId', 'kind'] as const)) {}

export class CreateLabourChallanDto extends Attachments {
  @ApiProperty() @IsUUID() vendorId!: string;
  @ApiProperty({ enum: LABOUR_CHALLAN_KINDS }) @IsIn(LABOUR_CHALLAN_KINDS) kind!: LabourChallanKind;
  @ApiProperty({ example: '2026-09', description: 'Wage month' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use a YYYY-MM month' }) month!: string;
  @ApiProperty({ example: '18500' }) @num() @IsNumberString() amount!: string;
  @ApiPropertyOptional({ example: 42, description: 'Members or insured persons on it' }) @IsOptional() @nullable() @IsInt() @Min(1) @Max(100000) workers?: number | null;
  @ApiProperty({ example: '2026-10-12' }) @IsDateString() @dateOnly() paidOn!: string;
  @ApiProperty({ example: '1052610012345', description: 'Challan number or TRRN' }) @trim() @IsString() @MinLength(1) @MaxLength(60) reference!: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @trim() @IsString() @MaxLength(500) note?: string | null;
}

/** Correct a challan; its contractor, kind and month stay. */
export class UpdateLabourChallanDto extends PartialType(OmitType(CreateLabourChallanDto, ['vendorId', 'kind', 'month'] as const)) {}

export class ReleaseLabourHoldDto {
  @ApiProperty({ example: 'Challans seen at the contractor’s office; copies to follow' }) @trim() @IsString() @MinLength(5) @MaxLength(500) note!: string;
}
