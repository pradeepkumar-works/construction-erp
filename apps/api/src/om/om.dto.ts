import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { OM_BENCHMARKS, type OmBenchmark } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class OmQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'The month the log shows; the current one by default' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Give the month as YYYY-MM' })
  month?: string;
}

export class OmBenchmarkInputDto {
  @ApiProperty({ enum: OM_BENCHMARKS }) @IsIn(OM_BENCHMARKS as unknown as string[]) key!: OmBenchmark;
  @ApiProperty({ example: '135' }) @num() @IsNumberString({}, { message: 'Give each benchmark’s limit as a number' }) limit!: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(0) @Max(31) allowedPerMonth!: number;
  @ApiProperty({ example: '5000', description: 'Rupees for each failure beyond the allowed count' }) @num() @IsNumberString({}, { message: 'Give each penalty in rupees' }) penalty!: string;
}

export class OmStaffNormInputDto {
  @ApiProperty({ example: 'Plant operator' }) @trim() @IsString({ message: 'Name each role' }) @MaxLength(60) role!: string;
  @ApiProperty({ example: 3 }) @IsInt() @Min(1) @Max(200) required!: number;
  @ApiProperty({ example: '18000' }) @num() @IsNumberString({}, { message: 'Give each role’s monthly pay in rupees' }) monthlyPay!: string;
}

export class OmChemicalNormInputDto {
  @ApiProperty() @IsUUID('all', { message: 'Choose the chemical from the item master' }) itemId!: string;
  @ApiProperty({ example: '25', description: 'Quantity in the item’s unit per million litres treated' }) @num() @IsNumberString({}, { message: 'Give the norm per ML as a number' }) perMl!: string;
}

export class SaveOmContractDto {
  @ApiProperty({ example: '2025-04-01', description: 'The first day of O&M year 1, a first of the month' }) @IsDateString() startOn!: string;
  @ApiProperty({ example: 5 }) @IsInt() @Min(1) @Max(15) years!: number;
  @ApiProperty({ example: ['3', '3.25', '3.5', '3.75', '4'], description: '% of the contract value for each year, year 1 first' })
  @IsArray()
  @ArrayMaxSize(15)
  @IsNumberString({}, { each: true, message: 'Give each year’s % as a number' })
  yearPcts!: string[];
  @ApiProperty({ example: 4 }) @IsInt() @IsIn([1, 2, 3, 4, 6, 12], { message: 'Instalments a year must be 1, 2, 3, 4, 6 or 12' }) instalmentsPerYear!: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @IsInt() @Min(0) @Max(10) extensionYears?: number;
  @ApiProperty({ example: 38500 }) @IsInt() @Min(1) @Max(50_000_000) population!: number;
  @ApiProperty({ type: [OmBenchmarkInputDto] }) @IsArray() @ArrayMaxSize(OM_BENCHMARKS.length) @ValidateNested({ each: true }) @Type(() => OmBenchmarkInputDto) benchmarks!: OmBenchmarkInputDto[];
  @ApiProperty({ type: [OmStaffNormInputDto] }) @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => OmStaffNormInputDto) staff!: OmStaffNormInputDto[];
  @ApiProperty({ type: [OmChemicalNormInputDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => OmChemicalNormInputDto) chemicals!: OmChemicalNormInputDto[];
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class SaveServiceDayDto {
  @ApiProperty({ example: '2026-10-23' }) @IsDateString() date!: string;
  @ApiProperty({ example: '6420', description: 'Treated water out of the plant, kilolitres' }) @num() @IsNumberString({}, { message: 'Give the water produced in kilolitres' }) producedKl!: string;
  @ApiProperty({ example: '5610', description: 'Water that reached consumers, kilolitres' }) @num() @IsNumberString({}, { message: 'Give the water supplied in kilolitres' }) suppliedKl!: string;
  @ApiPropertyOptional({ example: '0.4', description: 'mg/l at the tail end' }) @IsOptional() @num() @opt() @IsNumberString() residualChlorine?: string | null;
  @ApiPropertyOptional({ example: '9.5', description: 'Metres of water at the tail end' }) @IsOptional() @num() @opt() @IsNumberString() tailPressureM?: string | null;
  @ApiPropertyOptional({ example: 4 }) @IsOptional() @IsInt() @Min(0) @Max(100_000) complaintsReceived?: number;
  @ApiPropertyOptional({ example: 4, description: 'Of those, closed within 48 hours' }) @IsOptional() @IsInt() @Min(0) @Max(100_000) complaintsClosed48h?: number;
  @ApiPropertyOptional({ example: '68' }) @IsOptional() @num() @opt() @IsNumberString() pumpEfficiencyPct?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}

export class OmStaffRowDto {
  @ApiProperty({ example: 'Pump operator' }) @trim() @IsString() @MaxLength(60) role!: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(0) @Max(500) deployed!: number;
}

export class SaveStaffMonthDto {
  @ApiProperty({ example: '2026-08' }) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Give the month as YYYY-MM' }) month!: string;
  @ApiProperty({ type: [OmStaffRowDto] }) @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => OmStaffRowDto) rows!: OmStaffRowDto[];
}
