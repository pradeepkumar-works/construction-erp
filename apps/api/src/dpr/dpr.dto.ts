import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, Min, ValidateNested } from 'class-validator';
import { IsQuantity } from '../common/quantity';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, SubmissionStatus, WEATHER_OPTIONS, Weather, type DprSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';
import { ChainageField, FloorField, VillageField } from '../common/sector';

export class ManpowerLineDto {
  @ApiProperty({ example: 'Mason' }) @IsString() category: string;
  @ApiProperty({ example: 12 }) @IsInt() @Min(0) count: number;
}

export class MachineryLineDto {
  @ApiProperty({ example: 'JCB 3DX' }) @IsString() name: string;
  @ApiProperty({ example: 8 }) @IsNumber() @Min(0) hours: number;
}

export class DprMaterialInputDto {
  @ApiProperty({ description: 'A store item' }) @IsUUID() itemId: string;
  @ApiProperty({ example: '92' }) @IsQuantity({ zero: true }) quantity: string;
}

/** A work line (item 127): it becomes a progress entry of the DPR. */
export class DprLineInputDto {
  @ApiPropertyOptional({ description: "The line's progress entry, to keep it when the DPR is edited; a new id (uuid v4) for a new line" }) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'An activity or sub-activity with no sub-activities of its own' }) @IsUUID() activityId: string;
  @ApiProperty({ example: '11.5' }) @IsQuantity() quantity: string;
  @ApiPropertyOptional({ example: 'Lift 4 of 6', description: 'Free text; made from the chainage, floor or village when left out' }) @IsOptional() @IsString() @MaxLength(200) location?: string | null;
  @ChainageField('Road / pipeline: metres from 0+000 where the work starts') chainageFrom?: number | null;
  @ChainageField('Where it ends (same as the start for work at one point)') chainageTo?: number | null;
  @FloorField() floor?: string | null;
  @VillageField() village?: string | null;
  @ApiPropertyOptional({ type: [ManpowerLineDto], description: 'The crew on this line' }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ManpowerLineDto) labour?: ManpowerLineDto[];
  @ApiPropertyOptional({ type: [MachineryLineDto], description: 'Machines on this line' }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => MachineryLineDto) machines?: MachineryLineDto[];
  @ApiPropertyOptional({ type: [DprMaterialInputDto], description: 'Material used, from the store items' }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => DprMaterialInputDto) materials?: DprMaterialInputDto[];
  @ApiPropertyOptional({ nullable: true, description: 'On a pipe stage activity: the segment worked on' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() pipeSegmentId?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'The valve fixed (VALVES stage), or the end of the segment the work started from' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() pipeNodeId?: string | null;
  @ApiPropertyOptional({ description: "A work order of the project the line was done under", nullable: true }) @IsOptional() @IsUUID() workOrderId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) remarks?: string | null;
  @ApiPropertyOptional({ description: "The line's fields of the company's own, by key", example: { trenchOpenRmt: 40 } }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() extra?: Record<string, unknown> | null;
  @ApiPropertyOptional({ type: [String], description: "The line's photos; on an edit, when sent, the complete list" }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class CreateDprDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiPropertyOptional({ enum: WEATHER_OPTIONS }) @IsOptional() @IsIn(WEATHER_OPTIONS as unknown as string[]) weather?: Weather;
  @ApiPropertyOptional() @IsOptional() @IsString() siteCondition?: string;
  @ApiPropertyOptional({ type: [ManpowerLineDto], description: 'On create, omit or send [] to take manpower from that day\'s attendance sheet.' }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManpowerLineDto) manpower?: ManpowerLineDto[];
  @ApiPropertyOptional({ type: [MachineryLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MachineryLineDto) machinery?: MachineryLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() materialReceived?: string;
  @ApiPropertyOptional({ description: 'Required without work lines; written from the lines when left out' }) @IsOptional() @IsString() workExecuted?: string;
  @ApiPropertyOptional({ type: [DprLineInputDto], description: 'The work done, line by line. On an edit, when sent, the complete list: lines left out are removed.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DprLineInputDto)
  lines?: DprLineInputDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() testsConducted?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() safetyObservations?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issues?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nextDayPlan?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ description: "The day's fields of the company's own, by key", example: { rainHours: 2.5 } }) @IsOptional() @IsObject() extra?: Record<string, unknown>;
  @ApiPropertyOptional({ description: "The version of the project type's DPR form the report was filled on (a phone filling offline); else the type's latest. Ignored on an edit, which keeps the report's own." })
  @IsOptional()
  @IsUUID()
  formId?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateDprDto extends PartialType(CreateDprDto) {}

/** `q` matches work executed, issues, site condition, project and submitter names. */
export class ListDprQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.dpr, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.dpr as unknown as string[]) sortBy?: DprSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'From this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
}

export class DprWorkOptionsQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ example: '2026-10-13', description: "The report's day, for the look-ahead (today when left out)" }) @IsOptional() @IsDateString() date?: string;
}
