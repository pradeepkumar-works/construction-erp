import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ASSET_CLASS_CODES, ASSET_FUNDINGS, DEPRECIATION_METHODS, FIXED_ASSET_STATUSES, PAYMENT_MODES, type AssetFunding, type DepreciationMethod, type FixedAssetStatus, type PaymentMode } from '@erp/shared';
import { PageQuery } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Amount = (message: string, min = 0) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message }), Min(min, { message }), Max(10_000_000_000)].forEach((d) => d(target, key));
const PAY_MODES = PAYMENT_MODES.filter((m) => m !== 'CREDIT');

export class CreateFixedAssetDto {
  @ApiProperty({ example: 'Dell Latitude 5440' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the asset' }) @MaxLength(160) name: string;
  @ApiProperty({ enum: ASSET_CLASS_CODES }) @IsIn(ASSET_CLASS_CODES, { message: 'Choose the asset class' }) assetClass: string;
  @ApiPropertyOptional({ enum: DEPRECIATION_METHODS, default: 'SLM' }) @IsOptional() @IsIn(DEPRECIATION_METHODS as unknown as string[]) method?: DepreciationMethod;
  @ApiProperty({ example: 60000 }) @Amount('Enter the cost, above zero', 0.01) cost: number;
  @ApiPropertyOptional({ example: 3000, description: 'Left out, 5% of the cost' }) @IsOptional() @opt() @Amount('Enter the residual value') residual?: number | null;
  @ApiPropertyOptional({ example: 3, description: "Left out, the class's Schedule II life" }) @IsOptional() @opt() @IsInt({ message: 'Enter the useful life in whole years' }) @Min(1) @Max(100) lifeYears?: number | null;
  @ApiProperty({ example: '2026-04-01' }) @IsDateString({}, { message: 'Choose the day it was put to use' }) putToUseOn: string;
  @ApiPropertyOptional({ enum: ASSET_FUNDINGS, default: 'BANK' }) @IsOptional() @IsIn(ASSET_FUNDINGS as unknown as string[]) fundedBy?: AssetFunding;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID('4', { message: 'Choose the vendor' }) vendorId?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(60) serialNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(60) invoiceNo?: string | null;
  @ApiPropertyOptional({ description: 'Depreciation charged before Nirmaan, up to this day' }) @IsOptional() @opt() @IsDateString() openingAsOf?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount('Enter the depreciation charged before Nirmaan') openingDepreciation?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
  @ApiPropertyOptional({ description: 'An owned machine this asset is; hired machines are refused' }) @IsOptional() @opt() @IsUUID('4', { message: 'Choose the machine' }) equipmentId?: string | null;
  @ApiPropertyOptional({ description: 'Where it is; left out, head office' }) @IsOptional() @opt() @IsUUID('4', { message: 'Choose the site' }) projectId?: string | null;
}

/** Name, papers and note any time; cost, class, life, method and how it was paid for until a posted run charges it. */
export class UpdateFixedAssetDto extends PartialType(OmitType(CreateFixedAssetDto, ['equipmentId', 'projectId'] as const)) {}

export class FixedAssetQuery extends PageQuery {
  @ApiPropertyOptional({ enum: FIXED_ASSET_STATUSES }) @IsOptional() @IsIn(FIXED_ASSET_STATUSES as unknown as string[]) status?: FixedAssetStatus;
  @ApiPropertyOptional({ enum: ASSET_CLASS_CODES }) @IsOptional() @IsIn(ASSET_CLASS_CODES) assetClass?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: ['assetNo', 'putToUseOn', 'cost'] }) @IsOptional() @IsIn(['assetNo', 'putToUseOn', 'cost']) sortBy?: 'assetNo' | 'putToUseOn' | 'cost';
}

export class TransferAssetDto {
  @ApiPropertyOptional({ description: 'The site it goes to; null for head office' }) @IsOptional() @opt() @IsUUID('4', { message: 'Choose the site' }) toProjectId?: string | null;
  @ApiProperty({ example: '2026-11-02' }) @IsDateString({}, { message: 'Choose the day it moved' }) on: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) note?: string | null;
}

export class DisposeAssetDto {
  @ApiProperty({ example: '2026-11-05' }) @IsDateString({}, { message: 'Choose the day it was sold or scrapped' }) on: string;
  @ApiProperty({ example: 30000, description: 'What it fetched; zero when scrapped for nothing' }) @Amount('Enter what it fetched, or zero') proceeds: number;
  @ApiPropertyOptional({ enum: PAY_MODES, default: 'BANK' }) @IsOptional() @IsIn(PAY_MODES) mode?: PaymentMode;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) note?: string | null;
}

export class PrepareRunDto {
  @ApiProperty({ example: '2026-10-01' }) @IsDateString({}, { message: 'Choose the first day of the period' }) from: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString({}, { message: 'Choose the last day of the period' }) to: string;
}

export class ItScheduleQuery {
  @ApiPropertyOptional({ example: '2026-27', description: 'The financial year; left out, the one running' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/, { message: 'Choose a financial year like 2026-27' }) fy?: string;
}
