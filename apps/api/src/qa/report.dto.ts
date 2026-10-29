import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class QaReportQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'The month; this month when omitted' }) @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Give the month as YYYY-MM' }) month?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
