import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { LIST_SORT_FIELDS, SUBMISSION_STATUSES, SubmissionStatus, WEATHER_OPTIONS, Weather, type DprSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

export class ManpowerLineDto {
  @ApiProperty({ example: 'Mason' }) @IsString() category: string;
  @ApiProperty({ example: 12 }) @IsInt() @Min(0) count: number;
}

export class MachineryLineDto {
  @ApiProperty({ example: 'JCB 3DX' }) @IsString() name: string;
  @ApiProperty({ example: 8 }) @IsNumber() @Min(0) hours: number;
}

export class CreateDprDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiPropertyOptional({ enum: WEATHER_OPTIONS }) @IsOptional() @IsIn(WEATHER_OPTIONS as unknown as string[]) weather?: Weather;
  @ApiPropertyOptional() @IsOptional() @IsString() siteCondition?: string;
  @ApiPropertyOptional({ type: [ManpowerLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ManpowerLineDto) manpower?: ManpowerLineDto[];
  @ApiPropertyOptional({ type: [MachineryLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MachineryLineDto) machinery?: MachineryLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() materialReceived?: string;
  @ApiProperty() @IsString() workExecuted: string;
  @ApiPropertyOptional() @IsOptional() @IsString() testsConducted?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() safetyObservations?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issues?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nextDayPlan?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateDprDto extends PartialType(CreateDprDto) {}

/** `q` matches work executed, issues, site condition, project and submitter names. */
export class ListDprQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.dpr, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.dpr as unknown as string[]) sortBy?: DprSortField;
}
