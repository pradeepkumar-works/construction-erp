import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAX_REPORT_NAME, MAX_REPORT_RECIPIENTS, MAX_SCHEDULE_DAY, REPORT_FREQUENCIES, REPORT_SOURCE_KEYS, type ReportFrequency, type ReportSourceKey } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

/** The period and project a report runs over; a source with no date or no project leaves them out. */
export class ReportRunQuery {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'First day (default: the reporting month)' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose the first day as YYYY-MM-DD' }) from?: string;
  @ApiPropertyOptional({ example: '2026-11-30', description: 'Last day (default: the reporting month’s last day, or today)' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose the last day as YYYY-MM-DD' }) to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class RunReportDto extends ReportRunQuery {
  @ApiProperty({ description: 'ReportDefinition: { source, columns, filters, groupBy, totals, sort }, checked against the source’s columns' }) @IsObject() definition!: Record<string, unknown>;
}

export class SourceQuery {
  @ApiProperty({ enum: REPORT_SOURCE_KEYS }) @IsIn(REPORT_SOURCE_KEYS as unknown as string[], { message: 'Choose what the report is over' }) source!: ReportSourceKey;
}

export class ListSavedReportsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Only the caller’s own' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ description: 'Only those emailed on a schedule' }) @IsOptional() @QueryBool() @IsBoolean() scheduled?: boolean;
  @ApiPropertyOptional({ enum: ['name', 'updatedAt'] }) @IsOptional() @IsIn(['name', 'updatedAt']) sortBy?: 'name' | 'updatedAt';
}

export class SaveReportDto {
  @ApiProperty() @IsString() @MaxLength(MAX_REPORT_NAME, { message: `Keep the name to ${MAX_REPORT_NAME} letters` }) name!: string;
  @ApiPropertyOptional({ description: 'Everyone in the company whose role opens the source may open it' }) @IsOptional() @IsBoolean() shared?: boolean;
  @ApiProperty({ description: 'ReportDefinition: { source, columns, filters, groupBy, totals, sort }' }) @IsObject() definition!: Record<string, unknown>;
}

export class ScheduleReportDto {
  @ApiProperty({ enum: REPORT_FREQUENCIES }) @IsIn(REPORT_FREQUENCIES as unknown as string[], { message: 'Choose weekly or monthly' }) frequency!: ReportFrequency;
  @ApiPropertyOptional({ description: '0 Monday to 6 Sunday, for a weekly report' }) @IsOptional() @IsInt() @Min(0) @Max(6) weekday?: number;
  @ApiPropertyOptional({ description: `1 to ${MAX_SCHEDULE_DAY}, for a monthly report` }) @IsOptional() @IsInt() @Min(1) @Max(MAX_SCHEDULE_DAY) dayOfMonth?: number;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(MAX_REPORT_RECIPIENTS) @IsUUID('all', { each: true }) recipientIds!: string[];
}
