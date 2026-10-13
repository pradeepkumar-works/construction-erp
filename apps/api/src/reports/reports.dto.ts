import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class ProgressReportQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-01', description: 'First day of the period' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-10-31', description: 'Last day of the period (at most 92 days after `from`)' }) @IsDateString() to: string;
}
