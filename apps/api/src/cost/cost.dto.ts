import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import type { CashFlowGranularity } from '@erp/shared';

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

export class BudgetHeadsInputDto {
  @ApiProperty({ example: '4500000.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() expenses: string;
  @ApiProperty({ example: '42000000.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() material: string;
  @ApiProperty({ example: '18000000.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() machinery: string;
  @ApiProperty({ example: '12000000.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() labour: string;
  @ApiProperty({ example: '25000000.00' }) @Transform(({ value }) => (typeof value === 'number' ? String(value) : value)) @IsNumberString() subcontract: string;
}

export class BoqBudgetRateDto {
  @ApiProperty() @IsUUID() boqItemId: string;
  @ApiProperty({ example: '1450.00', nullable: true, description: 'Budgeted cost per unit; null clears it' })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  budgetRate: string | null;
}

export class SetBudgetDto {
  @ApiPropertyOptional({ type: BudgetHeadsInputDto, nullable: true, description: 'The budget by cost head; null removes it' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => BudgetHeadsInputDto)
  heads?: BudgetHeadsInputDto | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional({ type: [BoqBudgetRateDto], description: 'Budget rates of BOQ items; items left out keep theirs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => BoqBudgetRateDto)
  items?: BoqBudgetRateDto[];
}

export class CashFlowQuery {
  @ApiPropertyOptional({ description: 'One project; omit for every project you can see' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: ['MONTH', 'WEEK'], default: 'MONTH', description: 'Six months, or twelve weeks' }) @IsOptional() @IsIn(['MONTH', 'WEEK']) granularity?: CashFlowGranularity;
}
