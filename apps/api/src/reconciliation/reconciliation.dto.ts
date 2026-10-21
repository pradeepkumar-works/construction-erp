import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

const numberString = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value);

export class ReconciliationQuery {
  @ApiPropertyOptional({ example: '2026-04-01', description: 'Start of the period (inclusive); omit for since the start' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'End of the period (inclusive); omit for up to today' }) @IsOptional() @IsDateString() to?: string;
}

export class SaveMaterialNormDto {
  @ApiProperty({ description: 'BOQ item of the project' }) @IsUUID() boqItemId: string;
  @ApiProperty({ description: 'Store item it uses' }) @IsUUID() itemId: string;
  @ApiProperty({ example: '8.2', description: 'Item units per unit of the BOQ item, up to six decimals' }) @Transform(numberString) @IsNumberString() qtyPerUnit: string;
  @ApiPropertyOptional({ example: '2', description: 'Allowed wastage in % (0 to 100); left out: 0 on a new norm, unchanged on an existing one' }) @IsOptional() @Transform(numberString) @IsNumberString() wastagePct?: string;
  @ApiPropertyOptional({ nullable: true, example: 'CPWD DAR, design mix' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
}

const KINDS = ['LABOUR', 'EQUIPMENT'] as const;
const IMPORT_KINDS = ['MATERIAL', 'LABOUR', 'EQUIPMENT'] as const;

export class SaveBoqResourceDto {
  @ApiPropertyOptional({ description: 'The resource to change (its name may change); left out, the BOQ item, kind and name find or add it' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ description: 'BOQ item of the project' }) @IsUUID() boqItemId: string;
  @ApiProperty({ enum: KINDS }) @IsIn(KINDS) kind: (typeof KINDS)[number];
  @ApiProperty({ example: 'Mason', description: 'A trade (as in labour rates) or an equipment category' }) @IsString() @MinLength(1) @MaxLength(80) name: string;
  @ApiProperty({ example: '0.25', description: 'Man-days or machine hours per unit of the BOQ item, up to six decimals' }) @Transform(numberString) @IsNumberString() qtyPerUnit: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) note?: string | null;
}

export class CopyRateAnalysisDto {
  @ApiProperty({ description: 'The BOQ item of this project to fill' }) @IsUUID() boqItemId: string;
  @ApiPropertyOptional({ description: 'Copy from this BOQ item (of any project you can open)' }) @IsOptional() @IsUUID() fromBoqItemId?: string;
  @ApiPropertyOptional({ example: 'RCC_M25', description: 'Or start from this entry of the starter library' }) @IsOptional() @IsString() @MaxLength(40) libraryKey?: string;
  @ApiPropertyOptional({ description: 'Remove what the item has first; left out, lines are added or changed and the rest kept' }) @IsOptional() @IsBoolean() replace?: boolean;
}

export class ImportRateRowDto {
  @ApiProperty({ example: 4, description: 'Row number in the sheet, for messages' }) @IsInt() @Min(1) row: number;
  @ApiProperty({ example: '3.01' }) @IsString() @MinLength(1) @MaxLength(40) boqItemNo: string;
  @ApiProperty({ enum: IMPORT_KINDS }) @IsIn(IMPORT_KINDS) kind: (typeof IMPORT_KINDS)[number];
  @ApiProperty({ example: 'OPC 53 Grade Cement', description: 'Store item name (material), trade (labour) or equipment category (machine)' }) @IsString() @MinLength(1) @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: 'Bags', description: "Material only: the store item's unit, when two items share a name" }) @IsOptional() @IsString() @MaxLength(30) unit?: string;
  @ApiProperty({ example: '8.2' }) @Transform(numberString) @IsNumberString() qtyPerUnit: string;
  @ApiPropertyOptional({ example: '2', description: 'Material only' }) @IsOptional() @Transform(numberString) @IsNumberString() wastagePct?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ImportRateAnalysisDto {
  @ApiProperty({ type: [ImportRateRowDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(3000) @ValidateNested({ each: true }) @Type(() => ImportRateRowDto)
  rows: ImportRateRowDto[];
}

export class EstimateTermsDto {
  @ApiProperty({ example: '5', description: 'Overheads, % of the cost of resources' }) @Transform(numberString) @IsNumberString() overheadPct: string;
  @ApiProperty({ example: '10', description: 'Profit, % of the cost of resources' }) @Transform(numberString) @IsNumberString() profitPct: string;
}

export class RecoverExcessDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty({ example: '12.5', description: "In the item's unit; at most the excess not yet raised" }) @Transform(numberString) @IsNumberString() quantity: string;
  @ApiProperty({ example: '395', description: 'Per unit; the item rate unless the contract says otherwise' }) @Transform(numberString) @IsNumberString() rate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}
