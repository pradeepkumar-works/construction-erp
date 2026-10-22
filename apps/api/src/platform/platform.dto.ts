import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MODULE_TIERS, type ModuleTier } from '@erp/shared';

export class SuspendDto {
  @ApiProperty({ example: 'Unpaid since August', description: 'Why (kept for Nirmaan staff and in the company audit log)' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class TrialDto {
  @ApiProperty({ example: '2026-12-31', description: 'Last day of the free trial' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'until must be a date like 2026-12-31' })
  @IsDateString()
  until: string;
}

export class ModuleTierDto {
  @ApiPropertyOptional({ enum: MODULE_TIERS, nullable: true, description: "The plan's module set (v6 item 117); null for every module" })
  @IsOptional()
  @IsIn(MODULE_TIERS)
  tier: ModuleTier | null;
}
