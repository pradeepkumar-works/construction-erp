import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class AttendanceCheckQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'The month, YYYY-MM (default this month)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose a month as YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ description: 'One project: also returns its days' })
  @IsOptional()
  @IsUUID('all', { message: 'Choose a project from the list' })
  projectId?: string;
}
