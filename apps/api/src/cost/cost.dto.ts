import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsNumberString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class CostQuery {
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Start of the period (inclusive); omit for since the start' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2027-03-31', description: 'End of the period (inclusive); omit for up to today' }) @IsOptional() @IsDateString() to?: string;
}

export class LabourRateInputDto {
  @ApiProperty({ example: 'Mason' }) @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @MinLength(1) @MaxLength(60) category: string;
  @ApiProperty({ example: '850.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() dailyRate: string;
}

export class SetLabourRatesDto {
  @ApiProperty({ type: [LabourRateInputDto], description: 'The full list: trades left out are removed' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LabourRateInputDto)
  rates: LabourRateInputDto[];
}
