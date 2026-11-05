import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { LIST_SORT_FIELDS, type AuditLogSortField } from '@erp/shared';
import { PageQuery } from '../common/paging';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `q` matches the note, the action and the person's name. Days are the company's (India time). */
export class ListAuditLogQuery extends PageQuery {
  @ApiPropertyOptional({ example: 'PURCHASE_ORDER', description: 'The kind of record (`AuditLog.entityType`)' }) @IsOptional() @IsString() @MaxLength(60) kind?: string;
  @ApiPropertyOptional({ example: 'APPROVED' }) @IsOptional() @IsString() @MaxLength(60) action?: string;
  @ApiPropertyOptional({ description: 'Who did it' }) @IsOptional() @IsUUID() actorId?: string;
  @ApiPropertyOptional({ description: 'One record: its id' }) @IsOptional() @IsUUID() entityId?: string;
  @ApiPropertyOptional({ example: '2026-11-01' }) @IsOptional() @Matches(DAY, { message: 'from must be a date like 2026-11-01' }) from?: string;
  @ApiPropertyOptional({ example: '2026-11-05' }) @IsOptional() @Matches(DAY, { message: 'to must be a date like 2026-11-05' }) to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.auditLog, default: 'createdAt' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.auditLog as unknown as string[]) sortBy?: AuditLogSortField;
}
