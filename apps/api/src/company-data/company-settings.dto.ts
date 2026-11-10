import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { CIN_PATTERN, GSTIN_PATTERN, PAN_PATTERN, TAN_PATTERN } from '@erp/shared';

const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() || null : value));
const trimmed = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class UpdateCompanyProfileDto {
  @ApiPropertyOptional({ example: 'Sai Ram Constructions Pvt Ltd' }) @IsOptional() @trimmed() @nullable() @IsString() @MaxLength(160) legalName?: string | null;
  @ApiPropertyOptional({ example: 'Plot 12, Saheed Nagar, Bhubaneswar 751007' }) @IsOptional() @trimmed() @nullable() @IsString() @MaxLength(400) address?: string | null;
  @ApiPropertyOptional({ example: '21AABCS1234F1Z5' }) @IsOptional() @upper() @nullable() @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21AABCS1234F1Z5' }) gstin?: string | null;
  @ApiPropertyOptional({ example: 'AABCS1234F' }) @IsOptional() @upper() @nullable() @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like AABCS1234F' }) pan?: string | null;
  @ApiPropertyOptional({ example: 'U45200OR2015PTC012345' }) @IsOptional() @upper() @nullable() @Matches(CIN_PATTERN, { message: 'CIN must be 21 characters, like U45200OR2015PTC012345' }) cin?: string | null;
  @ApiPropertyOptional({ example: 'BBNA01234F', description: 'Tax deduction account number, for the TDS returns' }) @IsOptional() @upper() @nullable() @Matches(TAN_PATTERN, { message: 'TAN must be 10 characters: four letters, five digits and a letter, like BBNA01234F' }) tan?: string | null;
}

export class UpdateCompanyLogoDto {
  @ApiProperty({ nullable: true, description: 'A PNG, JPEG or WebP data URL of 200 KB at most; null takes the logo off' })
  @nullable()
  @IsString()
  @MaxLength(300_000)
  logo: string | null;
}

export class UpdateDocSeriesDto {
  @ApiProperty({ example: { PO: 'PO/{FY}/{NNNN}', WO: 'WO/{FY}/{NNNN}' }, description: 'A pattern per kind; a kind left out goes back to the standard pattern' })
  @IsObject()
  series: Record<string, string>;
}
