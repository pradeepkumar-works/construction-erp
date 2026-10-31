import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { EOT_BASES, type EotBasis } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class SubmitProgrammeDto {
  @ApiPropertyOptional({ example: '2026-10-30', description: 'Today when left out' }) @IsOptional() @IsDateString() submittedOn?: string;
  @ApiPropertyOptional({ example: 'NIR/BL-02/2026/114' }) @IsOptional() @trim() @IsString() @MaxLength(120) letterRef?: string | null;
  @ApiPropertyOptional({ example: 'Monthly update: second floor slab moved two weeks for the drawing delay' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
}

export class DecideProgrammeDto {
  @ApiProperty({ enum: ['APPROVED', 'RETURNED'] }) @IsIn(['APPROVED', 'RETURNED']) decision: 'APPROVED' | 'RETURNED';
  @ApiPropertyOptional({ example: '2026-11-04', description: 'Today when left out' }) @IsOptional() @IsDateString() decidedOn?: string;
  @ApiPropertyOptional({ example: 'Show the shuttering cycle for each floor separately', description: 'Required to return it' }) @IsOptional() @trim() @IsString() @MaxLength(4000) note?: string | null;
  @ApiPropertyOptional({ example: 'Resident engineer, letter of 4 Nov', description: 'Staff recording a letter: who answered' }) @IsOptional() @trim() @IsString() @MaxLength(160) decidedByName?: string | null;
}

export class ProgrammeIntervalDto {
  @ApiProperty({ example: 30, nullable: true, description: 'Days between updates as the contract sets them; null for the standard 30' })
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(366)
  days: number | null;
}

export class ApplyEotDto {
  @ApiProperty({ enum: EOT_BASES }) @IsIn(EOT_BASES as unknown as string[]) basis: EotBasis;
  @ApiPropertyOptional({ example: '2026-10-30', description: 'Today when left out' }) @IsOptional() @IsDateString() appliedOn?: string;
  @ApiProperty({ example: 21 }) @IsInt() @Min(1) @Max(3650) daysClaimed: number;
  @ApiProperty({ example: 'Site handed over late at the pump house; drawings for the ESR held for 3 weeks' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) grounds: string;
  @ApiPropertyOptional({ example: 'NIR/BL-02/2026/121' }) @IsOptional() @trim() @IsString() @MaxLength(120) letterRef?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'For a claim on delays: the delays in the register it is for' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  delayIds?: string[];
  @ApiPropertyOptional({ description: 'For added work: the variation' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() variationId?: string | null;
}

export class ForwardEotDto {
  @ApiPropertyOptional({ example: '2026-11-02', description: 'Today when left out' }) @IsOptional() @IsDateString() forwardedOn?: string;
  @ApiPropertyOptional({ example: 14, description: "The Engineer's recommendation, in days" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(3650) recommendedDays?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) note?: string | null;
  @ApiPropertyOptional({ example: 'Resident engineer', description: 'Staff recording a letter: who forwarded it' }) @IsOptional() @trim() @IsString() @MaxLength(160) forwardedByName?: string | null;
}

export class DecideEotDto {
  @ApiPropertyOptional({ example: '2026-11-20', description: 'Today when left out' }) @IsOptional() @IsDateString() decidedOn?: string;
  @ApiProperty({ example: 14, description: 'Days granted: 0 refuses it' }) @IsInt() @Min(0) @Max(3650) grantedDays: number;
  @ApiPropertyOptional({ example: 'PIU/EOT/2026/07' }) @IsOptional() @trim() @IsString() @MaxLength(120) decisionRef?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) note?: string | null;
}
