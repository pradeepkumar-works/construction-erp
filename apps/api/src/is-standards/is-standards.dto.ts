import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IS_CLAUSE_CHECKS, IS_DISCIPLINES, type IsClauseCheckBy, type IsDiscipline } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blankIsNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });

export class IsClauseCheckDto {
  @ApiProperty({ enum: IS_CLAUSE_CHECKS }) @IsIn(IS_CLAUSE_CHECKS as unknown as string[]) by: IsClauseCheckBy;
  @ApiPropertyOptional({ example: 'CUBE', description: 'The test type, for a clause proved by a test' }) @ValidateIf((o: IsClauseCheckDto) => o.by === 'TEST') @trim() @IsString() @IsNotEmpty({ message: 'Choose the test that proves the clause' }) @MaxLength(30) testTypeCode?: string;
}

export class IsClauseDto {
  @ApiPropertyOptional({ example: '15.2.2' }) @IsOptional() @blankIsNull() @IsString() @MaxLength(40) ref?: string | null;
  @ApiProperty({ example: 'Frequency of sampling' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @ApiProperty({ description: 'What the clause asks, in the company’s words' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) requirement: string;
  @ApiProperty({ type: IsClauseCheckDto }) @ValidateNested() @Type(() => IsClauseCheckDto) check: IsClauseCheckDto;
  @ApiPropertyOptional() @IsOptional() @blankIsNull() @IsString() @MaxLength(300) sampling?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankIsNull() @IsString() @MaxLength(300) tolerance?: string | null;
}

export class SaveIsStandardDto {
  @ApiProperty({ example: 'IS 456' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) number: string;
  @ApiProperty({ example: 2000 }) @IsInt() @Min(1947) @Max(2100) year: number;
  @ApiPropertyOptional({ example: 2021 }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1947) @Max(2100) reaffirmed?: number | null;
  @ApiProperty({ example: 'Plain and reinforced concrete: code of practice' }) @trim() @IsString() @IsNotEmpty() @MaxLength(300) title: string;
  @ApiProperty({ enum: IS_DISCIPLINES }) @IsIn(IS_DISCIPLINES as unknown as string[]) discipline: IsDiscipline;
  @ApiProperty({ example: 'Concrete' }) @trim() @IsString() @IsNotEmpty() @MaxLength(80) subject: string;
  @ApiProperty({ type: [IsClauseDto] }) @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => IsClauseDto) clauses: IsClauseDto[];
  @ApiPropertyOptional({ default: true, description: 'Tracked by the company' }) @IsOptional() @IsBoolean() active?: boolean;
}

export class IsComplianceQuery {
  @ApiPropertyOptional({ description: 'Omitted = every project the reader sees' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Tests sampled from this day; the financial year’s start when omitted' }) @IsOptional() @dateOnly() from?: string;
  @ApiPropertyOptional({ example: '2026-11-08', description: 'Tests sampled up to this day; today when omitted' }) @IsOptional() @dateOnly() to?: string;
}
