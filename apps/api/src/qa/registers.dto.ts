import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { CALIBRATION_RESULTS, LAB_KINDS, type CalibrationResult, type LabKind } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** An empty string clears a field. */
const blank = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

/* ---------- labs ---------- */

export class SaveLabDto {
  @ApiProperty({ example: 'Kalinga Testing Labs, Bhubaneswar' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ enum: LAB_KINDS }) @IsIn(LAB_KINDS as unknown as string[]) kind: LabKind;
  @ApiPropertyOptional({ example: 'TC-5678' }) @IsOptional() @blank() @IsString() @MaxLength(20) nablNo?: string | null;
  @ApiPropertyOptional({ example: '2027-06-30' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() nablValidTill?: string | null;
  @ApiPropertyOptional({ description: "A site lab's project" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(300) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(120) contact?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @ValidateIf((_, v) => v !== null) @IsEmail() @MaxLength(120) email?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(1000) notes?: string | null;
}

export class LabSamplesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() labId?: string;
  @ApiPropertyOptional({ enum: ['AT_LAB', 'REPORTED'], description: 'Omitted = both' }) @IsOptional() @IsIn(['AT_LAB', 'REPORTED']) state?: 'AT_LAB' | 'REPORTED';
  @ApiPropertyOptional({ description: 'Only reports later than the lab usually takes' }) @IsOptional() @QueryBool() @IsBoolean() late?: boolean;
}

/* ---------- instruments and calibration ---------- */

export class SaveInstrumentDto {
  @ApiProperty({ example: 'CTM 2000 kN, site lab' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ example: 'compression-testing-machine', description: 'An instrument kind (Masters › Instrument kinds), by code' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) kind: string;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(60) serialNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(80) make?: string | null;
  @ApiPropertyOptional({ example: '0 to 2000 kN' }) @IsOptional() @blank() @IsString() @MaxLength(80) range?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() labId?: string | null;
  @ApiPropertyOptional({ example: 365, description: "Days between calibrations; the kind's usual interval when omitted" }) @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(1825) intervalDays?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(1000) notes?: string | null;
}

export class InstrumentsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only overdue, due soon, never calibrated or out of use' }) @IsOptional() @QueryBool() @IsBoolean() attention?: boolean;
}

export class RecordCalibrationDto {
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() calibratedOn: string;
  @ApiPropertyOptional({ example: 'CAL/2026/1182' }) @IsOptional() @blank() @IsString() @MaxLength(60) certificateNo?: string | null;
  @ApiPropertyOptional({ example: 'An NABL calibration lab' }) @IsOptional() @blank() @IsString() @MaxLength(120) agency?: string | null;
  @ApiProperty({ enum: CALIBRATION_RESULTS }) @IsIn(CALIBRATION_RESULTS as unknown as string[]) result: CalibrationResult;
  @ApiPropertyOptional({ description: "The next due day on the certificate; the instrument's interval from today's calibration when omitted" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  nextDueOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

/* ---------- test certificates ---------- */

export class CertificateCategoriesDto {
  @ApiProperty({ type: [String], example: ['steel', 'cement', 'pipes-and-fittings'], description: 'Item categories (Masters › Item categories) by code' })
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  categories: string[];
}
