import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { SUBMISSION_STATUSES, SubmissionStatus, WEATHER_OPTIONS, Weather } from '@erp/shared';

export class ManpowerLineDto {
  @ApiProperty({ example: 'Mason' }) @IsString() category: string;
  @ApiProperty({ example: 12 }) @IsInt() @Min(0) count: number;
}

export class MachineryLineDto {
  @ApiProperty({ example: 'JCB 3DX' }) @IsString() name: string;
  @ApiProperty({ example: 8 }) @IsNumber() @Min(0) hours: number;
}

export class CreateDprDto {
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

export class ListDprQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) limit?: number;
}
