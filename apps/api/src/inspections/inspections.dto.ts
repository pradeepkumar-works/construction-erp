import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { INSPECTION_RESULTS, LIST_SORT_FIELDS, REVIEW_DECISIONS, SUBMISSION_STATUSES, type InspectionResult, type InspectionSortField, type ReviewDecision, type SubmissionStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const trimItems = () => Transform(({ value }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '') : value));

export class CreateInspectionDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty() @IsUUID() activityId: string;
  @ApiProperty({ example: '2026-10-14', description: 'The date the work is ready for inspection' }) @IsDateString() date: string;
  @ApiProperty({ example: 'Block A, 2nd floor slab' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) location: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ description: "Checklist to copy the points from; omitted = the activity's checklist" })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  checklistTemplateId?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'The points to check, instead of a checklist' })
  @IsOptional()
  @trimItems()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  items?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: true, description: 'Send the request to QA/QC now' }) @IsOptional() @IsBoolean() submit?: boolean;
}

/** Changing the checklist or the points starts the checklist afresh. */
export class UpdateInspectionDto extends PartialType(OmitType(CreateInspectionDto, ['id', 'projectId'] as const)) {}

export class InspectionResultInputDto {
  @ApiProperty({ enum: INSPECTION_RESULTS }) @IsIn(INSPECTION_RESULTS as unknown as string[]) result: InspectionResult;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) remark?: string | null;
}

export class InspectDto {
  @ApiProperty({ enum: REVIEW_DECISIONS, description: 'APPROVE = passed, REJECT = failed, REQUEST_CHANGES = re-inspect after rectification' })
  @IsIn(REVIEW_DECISIONS as unknown as string[])
  decision: ReviewDecision;
  @ApiProperty({ type: [InspectionResultInputDto], description: 'One result per checklist point, in order' })
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => InspectionResultInputDto)
  results: InspectionResultInputDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ type: [String], description: "Inspector's photos, added to the request's" }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

/** `q` matches inspection number, location, remarks, activity, project and requester. */
export class ListInspectionsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() activityId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only requests by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.inspections, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.inspections as unknown as string[]) sortBy?: InspectionSortField;
}

export class ChecklistTemplateInputDto {
  @ApiProperty({ example: 'Reinforcement before concreting' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ type: [String] }) @trimItems() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(300, { each: true }) items: string[];
}
export class UpdateChecklistTemplateDto extends PartialType(ChecklistTemplateInputDto) {}
