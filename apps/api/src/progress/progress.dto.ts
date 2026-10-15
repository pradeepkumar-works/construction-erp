import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, SubmissionStatus, type ProgressSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';
import { ChainageField, FloorField, VillageField } from '../common/sector';

export class CreateProgressDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() activityId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiProperty({ example: '45.5' }) @IsNumberString() quantity: string;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
  @ApiPropertyOptional({ example: 'Ch. 2+400 to 2+600', description: 'Free text; made from the chainage, floor or village when left out' }) @IsOptional() @IsString() location?: string;
  @ChainageField('Road / pipeline: metres from 0+000 where the work starts') chainageFrom?: number | null;
  @ChainageField('Where it ends (same as the start for work at one point)') chainageTo?: number | null;
  @FloorField() floor?: string | null;
  @VillageField() village?: string | null;
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
