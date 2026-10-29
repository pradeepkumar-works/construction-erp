import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { NCR_SEVERITIES, QA_AUDIT_KINDS, type NcrSeverity, type QaAuditKind } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blank = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

export class AuditFindingInputDto {
  @ApiPropertyOptional({ description: 'An existing finding, when the audit is changed' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ example: 'Cover blocks missing at the bottom of beam B12' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) text: string;
  @ApiPropertyOptional({ enum: NCR_SEVERITIES, default: 'MINOR' }) @IsOptional() @IsIn(NCR_SEVERITIES as unknown as string[]) severity?: NcrSeverity;
  @ApiPropertyOptional({ example: '2026-11-05', description: 'Put right by' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueOn?: string | null;
}

export class SaveAuditDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: QA_AUDIT_KINDS }) @IsIn(QA_AUDIT_KINDS as unknown as string[]) kind: QaAuditKind;
  @ApiProperty({ example: '2026-10-27' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: 'EE (Quality Control), Works Department' }) @IsOptional() @blank() @IsString() @MaxLength(200) visitor?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(4000) summary?: string | null;
  @ApiPropertyOptional({ example: 82, description: "An internal audit's score out of 100" }) @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(0) @Max(100) score?: number | null;
  @ApiProperty({ type: [AuditFindingInputDto] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AuditFindingInputDto) findings: AuditFindingInputDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class AuditsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: QA_AUDIT_KINDS }) @IsOptional() @IsIn(QA_AUDIT_KINDS as unknown as string[]) kind?: QaAuditKind;
  @ApiPropertyOptional({ description: 'Only audits with findings still open' }) @IsOptional() @QueryBool() @IsBoolean() open?: boolean;
}

export class CloseFindingDto {
  @ApiProperty({ example: 'Cover blocks fixed and checked before the pour' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export class FindingNcrDto {
  @ApiPropertyOptional({ description: 'Who is to rectify it' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() actionById?: string | null;
  @ApiPropertyOptional({ example: 'workmanship', description: 'An NCR category, by code' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) category?: string | null;
}
