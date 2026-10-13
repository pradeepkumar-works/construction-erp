import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { LIST_SORT_FIELDS, type AttendanceSortField } from '@erp/shared';
import { PageQuery } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = () => Matches(DATE_ONLY, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class AttendanceLineInputDto {
  @ApiProperty({ example: 'Departmental', description: 'Labour contractor, or "Departmental" for own workers' })
  @IsString() @trim() @MinLength(1) @MaxLength(120)
  contractor: string;

  @ApiProperty({ example: 'Mason' })
  @IsString() @trim() @MinLength(1) @MaxLength(60)
  category: string;

  @ApiProperty({ example: 12, minimum: 0 })
  @IsInt() @Min(0)
  count: number;
}

export class CreateAttendanceDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiProperty({ type: [AttendanceLineInputDto], description: 'Rows with the same contractor and trade are merged; zero rows are dropped.' })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AttendanceLineInputDto)
  lines: AttendanceLineInputDto[];
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional({ example: '2026-10-13' }) @IsOptional() @IsDateString() @dateOnly() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;

  @ApiPropertyOptional({ type: [AttendanceLineInputDto], description: 'When sent, replaces every line of the sheet.' })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => AttendanceLineInputDto)
  lines?: AttendanceLineInputDto[];
}

/** `q` matches project name, recorder, contractor and trade. */
export class ListAttendanceQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'From this date (inclusive)' }) @IsOptional() @IsDateString() @dateOnly() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Up to this date (inclusive)' }) @IsOptional() @IsDateString() @dateOnly() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.attendance, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.attendance as unknown as string[]) sortBy?: AttendanceSortField;
}

export class AttendanceDayQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() @dateOnly() date: string;
}

export class AttendanceSuggestionsQuery {
  @ApiPropertyOptional({ description: 'Prefer names used on this project' }) @IsOptional() @IsUUID() projectId?: string;
}
