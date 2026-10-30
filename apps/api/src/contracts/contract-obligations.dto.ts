import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { OBLIGATION_ANCHORS, OBLIGATION_PARTIES, OBLIGATION_PENALTIES, type ObligationAnchor, type ObligationParty, type ObligationPenalty } from '@erp/shared';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));

/** A contract obligation (item 167). */
export class CreateContractObligationDto {
  @ApiProperty({ example: 'Submit the construction programme' }) @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional({ example: 'GCC 13.1' }) @IsOptional() @blankNull() @IsString() @MaxLength(60) clause?: string | null;
  @ApiPropertyOptional({ enum: OBLIGATION_PARTIES, description: 'CONTRACTOR: we owe it; CLIENT: the client owes it (no penalty on our bills)' })
  @IsOptional()
  @IsIn(OBLIGATION_PARTIES)
  party?: ObligationParty;
  @ApiProperty({ enum: OBLIGATION_ANCHORS, description: 'What the deadline is counted from; DATE takes `dueOn`' }) @IsIn(OBLIGATION_ANCHORS) anchor!: ObligationAnchor;
  @ApiPropertyOptional({ example: 15 }) @IsOptional() @IsInt() @Min(0) @Max(3650) offsetDays?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsInt() @Min(0) @Max(120) offsetMonths?: number;
  @ApiPropertyOptional({ example: '2026-07-01' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueOn?: string | null;
  @ApiPropertyOptional({ enum: OBLIGATION_PENALTIES }) @IsOptional() @IsIn(OBLIGATION_PENALTIES) penalty?: ObligationPenalty;
  @ApiPropertyOptional({ example: '0.2', description: '% of the contract value for WITHHOLD_PCT and ONCE_PCT, rupees for PER_MONTH and ONCE_AMOUNT' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  penaltyValue?: string | null;
  @ApiPropertyOptional({ example: '2026-06-28', description: 'The day it was met; null reopens it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() metOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() waived?: boolean;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(1000) note?: string | null;
}

/** Only the fields sent change. */
export class UpdateContractObligationDto extends PartialType(CreateContractObligationDto) {}
