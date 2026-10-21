import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

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
