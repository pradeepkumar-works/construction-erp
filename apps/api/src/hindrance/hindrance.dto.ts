import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { DELAY_PARTIES, RISK_CATEGORIES, type DelayParty, type RiskCategory } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class HindranceQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

/** Recording a DPR hindrance: into an open delay (`riskId`), or as a new delay with these values over the suggestion's. */
export class RecordHindranceDto {
  @ApiPropertyOptional({ description: 'An open delay on the same project to add the remark to, instead of a new delay' }) @IsOptional() @IsUUID() riskId?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional({ enum: RISK_CATEGORIES }) @IsOptional() @IsIn(RISK_CATEGORIES as unknown as string[]) category?: RiskCategory;
  @ApiPropertyOptional({ enum: DELAY_PARTIES }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(DELAY_PARTIES as unknown as string[]) party?: DelayParty | null;
  @ApiPropertyOptional({ example: '2026-10-11' }) @IsOptional() @IsDateString() delayStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() activityId?: string;
}
