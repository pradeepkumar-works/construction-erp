import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { CIN_PATTERN, COMPANY_KINDS, GSTIN_PATTERN, PAN_PATTERN, ROLE_KEYS, type CompanyKind, type RoleKey } from '@erp/shared';

const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() || null : value));
const trimmed = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class MakeGroupDto {
  @ApiProperty({ example: 'Sai Ram Group' }) @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @MinLength(2) @MaxLength(120) name: string;
}

export class GroupCompanyDto {
  @ApiProperty({ example: 'Sai Ram Quality Labs Pvt Ltd' }) @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsNotEmpty() @MinLength(3) @MaxLength(120) name: string;
  @ApiProperty({ enum: COMPANY_KINDS }) @IsIn(COMPANY_KINDS as unknown as string[]) kind: CompanyKind;
  @ApiPropertyOptional() @IsOptional() @trimmed() @nullable() @IsString() @MaxLength(160) legalName?: string | null;
  @ApiPropertyOptional({ example: 'AABCS1234F' }) @IsOptional() @upper() @nullable() @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like AABCS1234F' }) pan?: string | null;
  @ApiPropertyOptional({ example: 'U45200OR2015PTC012345' }) @IsOptional() @upper() @nullable() @Matches(CIN_PATTERN, { message: 'CIN must be 21 characters, like U45200OR2015PTC012345' }) cin?: string | null;
  @ApiPropertyOptional({ example: '21AABCS1234F1Z5' }) @IsOptional() @upper() @nullable() @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21AABCS1234F1Z5' }) gstin?: string | null;
}

export class UpdateGroupCompanyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @MinLength(3) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: COMPANY_KINDS }) @IsOptional() @IsIn(COMPANY_KINDS as unknown as string[]) kind?: CompanyKind;
  @ApiPropertyOptional() @IsOptional() @trimmed() @nullable() @IsString() @MaxLength(160) legalName?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like AABCS1234F' }) pan?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(CIN_PATTERN, { message: 'CIN must be 21 characters, like U45200OR2015PTC012345' }) cin?: string | null;
  @ApiPropertyOptional() @IsOptional() @upper() @nullable() @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21AABCS1234F1Z5' }) gstin?: string | null;
}

export class GivePlaceDto {
  @ApiProperty() @IsUUID() loginId: string;
  @ApiProperty() @IsUUID() organizationId: string;
  @ApiProperty({ enum: ROLE_KEYS }) @IsIn(ROLE_KEYS as unknown as string[]) roleKey: RoleKey;
}

export class SetGroupAdminDto {
  @ApiProperty() @IsBoolean() admin: boolean;
}
