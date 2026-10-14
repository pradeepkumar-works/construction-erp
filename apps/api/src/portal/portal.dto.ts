import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQuery } from '../common/paging';

export class PortalDprQuery extends PageQuery {
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
}

export class PortalReportQuery {
  @ApiProperty({ example: '2026-10-01', description: 'First day of the period' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-10-31', description: 'Last day of the period (at most 92 days after `from`)' }) @IsDateString() to: string;
}

export class WitnessDto {
  @ApiPropertyOptional({ example: 'Attended. Cover blocks fine; clean the formwork before the pour.' }) @IsOptional() @IsString() @MaxLength(2000) note?: string | null;
}
