import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { POUR_SORT_FIELDS, POUR_SOURCES, POUR_STATUSES, type PourSortField, QA_FREQUENCIES, QA_PLAN_SOURCES, QA_WITNESSES, TEST_KINDS, type PourSource, type PourStatus, type QaFrequency, type QaPlanSource, type QaWitness, type TestKind } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
/** An empty string clears a number. */
const num = () => Transform(({ value }) => (value === '' ? null : typeof value === 'number' ? String(value) : value));
const toNumber = () => Transform(({ value }) => (value === '' || value === null || value === undefined ? null : Number(value)));

/* ---------- test types ---------- */

export class TestReadingDefDto {
  @ApiProperty({ example: '28 days' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) label: string;
  @ApiProperty({ example: 28, description: 'Days after sampling it falls due' }) @IsInt() @Min(0) @Max(365) days: number;
}

export class SaveTestTypeDto {
  @ApiProperty({ example: 'Concrete cube strength' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ enum: TEST_KINDS }) @IsIn(TEST_KINDS as unknown as string[]) kind: TestKind;
  @ApiProperty({ example: 'Concrete' }) @trim() @IsString() @MaxLength(80) material: string;
  @ApiPropertyOptional({ example: 'IS 516' }) @IsOptional() @trim() @IsString() @MaxLength(80) method?: string | null;
  @ApiProperty({ example: 'N/mm²' }) @trim() @IsString() @MaxLength(30) unit: string;
  @ApiPropertyOptional() @IsOptional() @toNumber() @ValidateIf((_, v) => v !== null) @IsNumber() specMin?: number | null;
  @ApiPropertyOptional() @IsOptional() @toNumber() @ValidateIf((_, v) => v !== null) @IsNumber() specMax?: number | null;
  @ApiProperty({ type: [TestReadingDefDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => TestReadingDefDto) readings: TestReadingDefDto[];
  @ApiProperty({ example: 3, description: 'Specimens in one sample' }) @IsInt() @Min(1) @Max(12) specimens: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}

/* ---------- the quality plan ---------- */

export class QaPlanQuery {
  @ApiProperty() @IsUUID() projectId: string;
}

export class TestsDueQuery {
  @ApiPropertyOptional({ description: 'Omitted = every project the reader sees' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only lines with tests short' }) @IsOptional() @QueryBool() @IsBoolean() short?: boolean;
}

export class CreatePlanLineDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'CUBE' }) @trim() @IsString() @IsNotEmpty() @MaxLength(30) testType: string;
  @ApiProperty({ enum: QA_PLAN_SOURCES }) @IsIn(QA_PLAN_SOURCES as unknown as string[]) source: QaPlanSource;
  @ApiPropertyOptional({ example: 'concrete, rcc, pcc', description: 'Words the work or the item is named with' }) @IsOptional() @trim() @IsString() @MaxLength(200) match?: string;
  @ApiPropertyOptional({ example: 'M25' }) @IsOptional() @trim() @IsString() @MaxLength(10) grade?: string | null;
  @ApiPropertyOptional({ example: 'Cement' }) @IsOptional() @trim() @IsString() @MaxLength(80) itemCategory?: string | null;
  @ApiProperty({ enum: QA_FREQUENCIES }) @IsIn(QA_FREQUENCIES as unknown as string[]) frequency: QaFrequency;
  @ApiPropertyOptional({ example: 500, description: 'One test per this much (by quantity), or per this much of a lot' }) @IsOptional() @toNumber() @ValidateIf((_, v) => v !== null) @IsNumber() per?: number | null;
  @ApiPropertyOptional({ example: 'm2' }) @IsOptional() @trim() @IsString() @MaxLength(20) unit?: string | null;
  @ApiPropertyOptional({ enum: QA_WITNESSES, default: 'OWN' }) @IsOptional() @IsIn(QA_WITNESSES as unknown as string[]) witness?: QaWitness;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() holdPoint?: boolean;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) notes?: string | null;
}

export class UpdatePlanLineDto extends PartialType(OmitType(CreatePlanLineDto, ['projectId'] as const)) {}

/* ---------- pours ---------- */

export class ListPoursQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: POUR_STATUSES }) @IsOptional() @IsIn(POUR_STATUSES as unknown as string[]) status?: PourStatus;
  @ApiPropertyOptional({ description: 'Only poured without a passed card or short of cube sets' }) @IsOptional() @QueryBool() @IsBoolean() flagged?: boolean;
  @ApiPropertyOptional({ example: 'M25' }) @IsOptional() @trim() @IsString() @MaxLength(10) grade?: string;
  @ApiPropertyOptional({ enum: POUR_SORT_FIELDS, default: 'date' }) @IsOptional() @IsIn(POUR_SORT_FIELDS as unknown as string[]) sortBy?: PourSortField;
}

export class CubesQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class CreatePourDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() activityId: string;
  @ApiProperty({ example: '2026-10-30' }) @IsDateString() date: string;
  @ApiProperty({ example: 'Block A, first floor slab' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) location: string;
  @ApiProperty({ example: 'M25' }) @trim() @IsString() @IsNotEmpty() @MaxLength(10) grade: string;
  @ApiProperty({ example: '42.5' }) @num() @IsNumberString() plannedVolume: string;
  @ApiPropertyOptional({ enum: POUR_SOURCES, default: 'RMC' }) @IsOptional() @IsIn(POUR_SOURCES as unknown as string[]) source?: PourSource;
  @ApiPropertyOptional({ example: 'The RMC plant' }) @IsOptional() @trim() @IsString() @MaxLength(120) supplier?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class UpdatePourDto extends PartialType(OmitType(CreatePourDto, ['id', 'projectId'] as const)) {}

export class PouredDto {
  @ApiProperty({ example: '41.0', description: 'The volume poured' }) @num() @IsNumberString() volume: string;
  @ApiPropertyOptional({ description: 'The day it was poured; the planned day when omitted' }) @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CancelPourDto {
  @ApiProperty({ example: 'Rain; moved to Monday' }) @trim() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
