import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class LeakageQuery {
  @ApiPropertyOptional({ example: '2026-10', description: 'The month, YYYY-MM (default this month)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Choose a month as YYYY-MM' })
  month?: string;
}
