import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  DELAY_PARTIES,
  LIST_SORT_FIELDS,
  RISK_CATEGORIES,
  RISK_KINDS,
  RISK_STATUSES,
  type DelayParty,
  type RiskCategory,
  type RiskKind,
  type RiskSortField,
  type RiskStatus,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const int = () => Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));

export class CreateRiskDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: RISK_KINDS }) @IsIn(RISK_KINDS as unknown as string[]) kind: RiskKind;
  @ApiProperty({ enum: RISK_CATEGORIES }) @IsIn(RISK_CATEGORIES as unknown as string[]) category: RiskCategory;
  @ApiProperty({ example: 'Encroachment at Ch 12+300 holding up GSB' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ description: 'Activity held up or at risk' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional({ description: 'Who follows it up (a user with access to the project)' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() ownerId?: string | null;
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Likelihood 1 to 5; a delay has already happened, so it defaults to 5' })
  @IsOptional()
  @int()
  @IsInt()
  @Min(1)
  @Max(5)
  probability?: number;
  @ApiProperty({ minimum: 1, maximum: 5, description: 'Impact on time / cost 1 to 5' }) @int() @IsInt() @Min(1) @Max(5) impact: number;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) mitigation?: string | null;
  @ApiPropertyOptional({ example: '2026-10-20', description: 'Target date for the mitigation or next review' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ example: '2026-10-08', description: 'Delay only (required for a delay): first day work was held up' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  delayStart?: string | null;
  @ApiPropertyOptional({ description: 'Delay only: last day work was held up; empty while it still is' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() delayEnd?: string | null;
  @ApiPropertyOptional({ description: 'Delay only: days lost as agreed; counted from the dates when empty' }) @IsOptional() @int() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(3650) daysLost?: number | null;
  @ApiPropertyOptional({ enum: DELAY_PARTIES, description: 'Delay only: who caused it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsIn(DELAY_PARTIES as unknown as string[]) responsibleParty?: DelayParty | null;
  @ApiPropertyOptional({ description: 'Delay only: an extension of time has been claimed' }) @IsOptional() @IsBoolean() eotClaimed?: boolean;
  @ApiPropertyOptional({ description: 'Delay only: days of extension the client granted (adds to the contract completion date)' })
  @IsOptional()
  @int()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(3650)
  eotGrantedDays?: number | null;
  @ApiPropertyOptional({ type: [String], description: 'Photos / letters as evidence' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateRiskDto extends PartialType(CreateRiskDto) {
  @ApiPropertyOptional({ enum: RISK_STATUSES, description: 'CLOSED records the closing time (and ends an open delay today)' })
  @IsOptional()
  @IsIn(RISK_STATUSES as unknown as string[])
  status?: RiskStatus;
  @ApiPropertyOptional({ description: 'How it was resolved' }) @IsOptional() @trim() @IsString() @MaxLength(2000) closureNote?: string | null;
}

/** `q` matches the number, title, description, mitigation and project name. */
export class ListRisksQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: RISK_KINDS }) @IsOptional() @IsIn(RISK_KINDS as unknown as string[]) kind?: RiskKind;
  @ApiPropertyOptional({ enum: RISK_STATUSES }) @IsOptional() @IsIn(RISK_STATUSES as unknown as string[]) status?: RiskStatus;
  @ApiPropertyOptional({ description: 'Open and monitoring entries' }) @IsOptional() @QueryBool() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ enum: RISK_CATEGORIES }) @IsOptional() @IsIn(RISK_CATEGORIES as unknown as string[]) category?: RiskCategory;
  @ApiPropertyOptional() @IsOptional() @IsUUID() ownerId?: string;
  @ApiPropertyOptional({ description: 'Only entries owned by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ description: 'Only scores at or above this (1 to 25)' }) @IsOptional() @int() @IsInt() @Min(1) @Max(25) minScore?: number;
  @ApiPropertyOptional({ description: 'Only active entries past their due date' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.risks, default: 'score' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.risks as unknown as string[]) sortBy?: RiskSortField;
}

export class RiskSuggestionsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
