import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, SubmissionStatus, type ProgressSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

export class CreateProgressDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() activityId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiProperty({ example: '45.5' }) @IsNumberString() quantity: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
  @ApiPropertyOptional({ example: 'Ch. 2+400 to 2+600' }) @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) manpowerCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() machineryUsed?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  /** When true the entry is created and immediately submitted for approval. */
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateProgressDto extends PartialType(CreateProgressDto) {}

/** `q` matches activity, location, remarks, project and submitter names. */
export class ListProgressQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() activityId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ description: 'Only entries created by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.progress, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.progress as unknown as string[]) sortBy?: ProgressSortField;
}
