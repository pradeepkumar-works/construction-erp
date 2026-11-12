import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ACTIVITY_LINK_TYPES, SCHEDULE_FILE_FORMATS, type ActivityLinkType, type ScheduleFileFormat } from '@erp/shared';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Km 12 to Km 20 handed over' }) @IsString() @MinLength(2) @MaxLength(200) name: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional({ description: 'The date it was reached; null to clear' }) @IsOptional() @IsDateString() achievedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

export class FreezeBaselineDto {
  @ApiPropertyOptional({ example: 'As agreed with the client at the kick-off meeting' }) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class CreateLinkDto {
  @ApiProperty({ description: 'The activity waited on' }) @IsUUID('4', { message: 'Choose the activity it follows' }) predecessorId: string;
  @ApiProperty({ description: 'The activity that waits' }) @IsUUID('4', { message: 'Choose the activity that follows' }) successorId: string;
  @ApiPropertyOptional({ enum: ACTIVITY_LINK_TYPES, default: 'FS' }) @IsOptional() @IsIn(ACTIVITY_LINK_TYPES as unknown as string[]) type?: ActivityLinkType;
  @ApiPropertyOptional({ description: 'Days after the link point, working days when the project has a working calendar; negative for a lead', example: 2 }) @IsOptional() @IsInt() @Min(-365) @Max(365) lagDays?: number;
}

export class UpdateLinkDto {
  @ApiPropertyOptional({ enum: ACTIVITY_LINK_TYPES }) @IsOptional() @IsIn(ACTIVITY_LINK_TYPES as unknown as string[]) type?: ActivityLinkType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-365) @Max(365) lagDays?: number;
}

export class ExportScheduleQuery {
  @ApiPropertyOptional({ enum: SCHEDULE_FILE_FORMATS, default: 'MSP_XML' }) @IsOptional() @IsIn(SCHEDULE_FILE_FORMATS as unknown as string[]) format?: ScheduleFileFormat;
}

export class ImportScheduleDto {
  @ApiProperty({ enum: SCHEDULE_FILE_FORMATS }) @IsIn(SCHEDULE_FILE_FORMATS as unknown as string[], { message: 'Choose MS Project XML or Primavera XER' }) format: ScheduleFileFormat;
  @ApiProperty({ description: 'The file as text' }) @IsString() @MinLength(10, { message: 'Choose the file' }) @MaxLength(4_000_000, { message: 'The file is too big: at most 4 MB' }) content: string;
  @ApiPropertyOptional({ description: 'Only say what would change' }) @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class UpdateWorkingCalendarDto {
  @ApiPropertyOptional({ description: 'Count the schedule in working days' }) @IsOptional() @IsBoolean() on?: boolean;
  @ApiPropertyOptional({ type: [Number], example: [0], description: 'Weekly days off, 0 Sunday to 6 Saturday' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOff?: number[];
}

export class CreateScheduleBreakDto {
  @ApiProperty({ example: '2027-07-01', description: 'First day the site stops' }) @IsDateString({}, { message: 'Enter the first day' }) from: string;
  @ApiProperty({ example: '2027-08-31', description: 'Last day it stops' }) @IsDateString({}, { message: 'Enter the last day' }) to: string;
  @ApiProperty({ example: 'Monsoon' }) @IsString() @MinLength(2, { message: 'Say why the site stops, such as Monsoon' }) @MaxLength(120) reason: string;
}
