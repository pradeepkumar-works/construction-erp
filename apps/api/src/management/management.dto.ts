import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** The vertical (item 167) a dashboard or report is limited to. */
export class VerticalQuery {
  @ApiPropertyOptional({ description: "A vertical's code, or `none` for projects with none; every vertical when left out" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  vertical?: string;
}

export class ManagementReportQuery extends VerticalQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'A monthly report’s month, YYYY-MM (default this month)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose a month as YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'A report over a period: its first day (default the financial year’s)' })
  @IsOptional()
  @IsDateString({}, { message: 'Choose the first day as YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-26', description: 'A report over a period: its last day (default today)' })
  @IsOptional()
  @IsDateString({}, { message: 'Choose the last day as YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Only this project; every project the caller sees when left out' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
