import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { CURRENCY_CODES, LD_PERIODS, type LdPeriod } from '@erp/shared';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));
const int = () => Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value === '' ? null : value));
const pct = (example: string, description: string) => ApiPropertyOptional({ example, description: `${description}, % of the work value (0 to 100)` });

/** Every field optional: only what is sent changes. Percentages are strings like "5" or "2.5". */
export class UpdateContractDto {
  @ApiPropertyOptional({ description: 'Client from the client master (null unlinks; the project keeps the name as text)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  clientId?: string | null;
  @ApiPropertyOptional({ example: 'WO/OWD/2025/0417' }) @IsOptional() @blankNull() @IsString() @MaxLength(100) workOrderNo?: string | null;
  @ApiPropertyOptional({ example: '12/EE/2025-26' }) @IsOptional() @blankNull() @IsString() @MaxLength(100) agreementNo?: string | null;
  @ApiPropertyOptional({ example: '2025-06-12' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() agreementDate?: string | null;
  @ApiPropertyOptional({ example: '186500000.00' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() contractValue?: string | null;
  @ApiPropertyOptional({ example: '2025-06-15' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ example: '2027-06-14', description: 'Completion date in the agreement (extensions come from the delay register)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  endDate?: string | null;
  @pct('5', 'Retention money held from each bill') @IsOptional() @num() @IsNumberString() retentionPct?: string;
  @pct('2.5', 'Security deposit deducted from each bill') @IsOptional() @num() @IsNumberString() securityDepositPct?: string;
  @ApiPropertyOptional({ example: '5', description: 'Security deposit stops at this % of the contract value, or of the work billed if larger; null for no cap' }) @IsOptional() @num() @ValidateIf((_, v) => v !== null) @IsNumberString() securityDepositCapPct?: string | null;
  @ApiPropertyOptional({ example: '9325000.00', description: 'Mobilisation advance received from the client' }) @IsOptional() @num() @IsNumberString() mobilisationAdvance?: string;
  @pct('10', 'Advance recovered from each bill until the whole advance is back') @IsOptional() @num() @IsNumberString() advanceRecoveryPct?: string;
  @ApiPropertyOptional({ example: 12 }) @IsOptional() @int() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(120) defectLiabilityMonths?: number | null;
  @ApiPropertyOptional({ example: 60, description: 'Days the client takes to pay a bill once sent' }) @IsOptional() @int() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(365) clientPaymentDays?: number | null;
  @ApiPropertyOptional({ example: 14, description: 'Days the contract allows to give notice of a hindrance' }) @IsOptional() @int() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1) @Max(180) noticeDays?: number | null;
  @ApiPropertyOptional({ example: 25, description: 'How far, in %, measurement may run past a BOQ item before it needs a variation (25 when not set)' }) @IsOptional() @int() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(500) measureTolerancePct?: number | null;
  @ApiPropertyOptional({ description: 'The contract has a price variation (escalation) clause' }) @IsOptional() @IsBoolean() priceVariation?: boolean;
  @pct('18', 'GST charged on bills') @IsOptional() @num() @IsNumberString() gstRate?: string;
  @pct('2', 'Income-tax TDS (section 194C) the client deducts') @IsOptional() @num() @IsNumberString() tdsPct?: string;
  @pct('2', 'GST TDS a government client deducts') @IsOptional() @num() @IsNumberString() gstTdsPct?: string;
  @pct('1', 'Labour welfare cess') @IsOptional() @num() @IsNumberString() labourCessPct?: string;
  @ApiPropertyOptional({ example: '0.5', description: 'Liquidated damages, % of the contract value per `ldPeriod` past the revised completion date (0 to 100)' })
  @IsOptional()
  @num()
  @IsNumberString()
  ldRatePct?: string;
  @ApiPropertyOptional({ enum: LD_PERIODS, example: 'WEEK' }) @IsOptional() @IsIn(LD_PERIODS) ldPeriod?: LdPeriod;
  @ApiPropertyOptional({ example: '10', description: 'Liquidated damages cap, % of the contract value (0 to 100)' }) @IsOptional() @num() @IsNumberString() ldCapPct?: string;
  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'USD', description: "The contract's currency; amounts stay in rupees at the contract rate" })
  @IsOptional()
  @IsIn(CURRENCY_CODES)
  currency?: string;
  @ApiPropertyOptional({ example: '83.25', description: 'Rupees to one unit of the contract currency, the rate its figures are kept at; empty in rupees' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  exchangeRate?: string | null;
}

export class PvComponentDto {
  @ApiProperty({ example: 'Cement' }) @IsString() @MaxLength(80) name!: string;
  @ApiProperty({ example: '15', description: '% of the work value that moves with this index' }) @num() @IsNumberString() sharePct!: string;
  @ApiProperty({ example: '142.6', description: 'Index on the base date' }) @num() @IsNumberString() baseIndex!: string;
}

/** The whole price variation formula; the list replaces the one saved. */
export class PriceVariationDto {
  @ApiPropertyOptional({ example: '2025-05-01', description: 'The date the base indices are taken at' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() pvBaseDate?: string | null;
  @ApiProperty({ type: [PvComponentDto] }) @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PvComponentDto) components!: PvComponentDto[];
}
