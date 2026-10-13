import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { LIST_SORT_FIELDS, PROJECT_STATUSES, PROJECT_TYPES, ProjectStatus, ProjectType, type ProjectSortField } from '@erp/shared';
import { PageQuery } from '../common/paging';

/** `q` matches code, name, client, location and work order no. */
export class ListProjectsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: PROJECT_STATUSES }) @IsOptional() @IsIn(PROJECT_STATUSES as unknown as string[]) status?: ProjectStatus;
  @ApiPropertyOptional({ enum: PROJECT_TYPES }) @IsOptional() @IsIn(PROJECT_TYPES as unknown as string[]) type?: ProjectType;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.projects, default: 'status' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.projects as unknown as string[]) sortBy?: ProjectSortField;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'RD-001' }) @IsString() @MinLength(2) code: string;
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty({ enum: PROJECT_TYPES }) @IsIn(PROJECT_TYPES as unknown as string[]) type: ProjectType;
  @ApiPropertyOptional({ enum: PROJECT_STATUSES }) @IsOptional() @IsIn(PROJECT_STATUSES as unknown as string[]) status?: ProjectStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() clientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consultantName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workOrderNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional({ example: '2027-06-30' }) @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ example: '125000000.00' }) @IsOptional() @IsNumberString() contractValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectManagerId?: string;
  @ApiPropertyOptional({ description: 'Add the standard activities for the project type (see /activity-templates), scheduled over the project dates' })
  @IsOptional()
  @IsBoolean()
  applyTemplate?: boolean;
}

export class UpdateProjectDto extends PartialType(OmitType(CreateProjectDto, ['applyTemplate'] as const)) {}

export class AddMemberDto {
  @ApiProperty() @IsUUID() userId: string;
}
