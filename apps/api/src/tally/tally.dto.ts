import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TallyRangeQuery {
  @ApiProperty({ example: '2026-10-31', description: 'Records dated on or before this day that are not yet exported' }) @IsDateString() upTo: string;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Leave out records before this day' }) @IsOptional() @IsDateString() from?: string;
}

export class UpdateTallySettingsDto {
  @ApiPropertyOptional({ example: 'Demo Infra Projects Pvt Ltd', description: 'Company name as it is in Tally; empty imports into the open company' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string | null;
  @ApiPropertyOptional({ example: '21', description: 'GST state code the bills are raised from' }) @IsOptional() @IsString() @MaxLength(2) stateCode?: string | null;
  @ApiPropertyOptional({ description: 'Projects as Tally cost centres' }) @IsOptional() @IsBoolean() costCentres?: boolean;
  @ApiPropertyOptional({ example: { SALES: 'Contract Receipts', 'EXPENSE:FUEL': 'Diesel' }, description: 'Ledger key to Tally ledger name; empty or null goes back to the default' })
  @IsOptional()
  @IsObject()
  ledgers?: Record<string, string | null>;
}
