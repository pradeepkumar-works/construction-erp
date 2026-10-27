import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CONTRACT_MODELS, type ContractModel, MAX_CHAINAGE_M, MAX_SECTOR_NAMES, LIST_SORT_FIELDS, PROJECT_STATUSES, PROJECT_TYPES, ProjectStatus, ProjectType, type ProjectSortField } from '@erp/shared';
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
  @ApiPropertyOptional({ enum: CONTRACT_MODELS, description: 'Item rate (default), lump sum or EPC' }) @IsOptional() @IsIn(CONTRACT_MODELS as unknown as string[]) contractModel?: ContractModel;
  @ApiPropertyOptional({ description: 'Client from the client master; sets clientName to its name' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() clientId?: string | null;
  @ApiPropertyOptional({ description: 'Free-text client name, used when no clientId is given' }) @IsOptional() @IsString() clientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() consultantName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() workOrderNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ example: '2026-01-01' }) @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional({ example: '2027-06-30' }) @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional({ example: '125000000.00' }) @IsOptional() @IsNumberString() contractValue?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectManagerId?: string;
  @ApiPropertyOptional({ description: 'Road / pipeline start, metres (0+000 = 0)', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(MAX_CHAINAGE_M) chainageStart?: number | null;
  @ApiPropertyOptional({ description: 'Road / pipeline end, metres', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(MAX_CHAINAGE_M) chainageEnd?: number | null;
  @ApiPropertyOptional({ type: [String], description: 'Building floors, bottom up' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean))] : value))
  @IsArray()
  @ArrayMaxSize(MAX_SECTOR_NAMES)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  floors?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Water supply villages / habitations' })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? [...new Set(value.map((v) => (typeof v === 'string' ? v.trim() : v)).filter(Boolean))] : value))
  @IsArray()
  @ArrayMaxSize(MAX_SECTOR_NAMES)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  villages?: string[];
  @ApiPropertyOptional({ description: 'Site latitude for GPS check-in (v5 item 97), decimal degrees', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-90) @Max(90) siteLat?: number | null;
  @ApiPropertyOptional({ description: 'Site longitude, decimal degrees', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumber({ maxDecimalPlaces: 6 }) @Min(-180) @Max(180) siteLng?: number | null;
  @ApiPropertyOptional({ description: 'Check-in radius in metres (default 300)', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(25) @Max(10_000) siteRadiusM?: number | null;
  @ApiPropertyOptional({ description: 'Refuse a check-in from outside the radius, or without a position' }) @IsOptional() @IsBoolean() siteCheckInStrict?: boolean;
  @ApiPropertyOptional({ description: 'Add the standard activities for the project type (see /activity-templates), scheduled over the project dates' })
  @IsOptional()
  @IsBoolean()
  applyTemplate?: boolean;
}

export class UpdateProjectDto extends PartialType(OmitType(CreateProjectDto, ['applyTemplate'] as const)) {}

export class AddMemberDto {
  @ApiProperty() @IsUUID() userId: string;
}
