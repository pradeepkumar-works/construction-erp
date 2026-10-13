import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { PROJECT_STATUSES, PROJECT_TYPES, ProjectStatus, ProjectType } from '@erp/shared';

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
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class AddMemberDto {
  @ApiProperty() @IsUUID() userId: string;
}
