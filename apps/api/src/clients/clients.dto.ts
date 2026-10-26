import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { GSTIN_PATTERN, PAN_PATTERN } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));
const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() || null : value));
/** One of the client's usual terms, % of the work value; null (or empty) takes the standard */
const term = (example: string, description: string) => (target: object, key: string) => {
  ApiPropertyOptional({ example, nullable: true, description: `${description}, % of the work value; empty takes the standard` })(target, key);
  IsOptional()(target, key);
  num()(target, key);
  ValidateIf((_, v) => v !== null)(target, key);
  IsNumberString({}, { message: `${key} must be a number like 5 or 2.5` })(target, key);
};

export class CreateClientDto {
  @ApiProperty({ example: 'Odisha Works Department' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: 'Roads Division, Khordha' }) @IsOptional() @blankNull() @IsString() @MaxLength(200) department?: string | null;
  @ApiPropertyOptional({ example: '21AAAGO1234F1Z5' }) @IsOptional() @upper() @ValidateIf((_, v) => v !== null) @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21AAAGO1234F1Z5' }) gstin?: string | null;
  @ApiPropertyOptional({ example: 'AAAGO1234F' }) @IsOptional() @upper() @ValidateIf((_, v) => v !== null) @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like AAAGO1234F' }) pan?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(500) billingAddress?: string | null;
  @ApiPropertyOptional({ example: '21', description: 'GST state code; taken from the GSTIN when one is given' })
  @IsOptional()
  @blankNull()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{2}$/, { message: 'State code is two digits' })
  stateCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(120) contactPerson?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @ValidateIf((_, v) => v !== null) @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(40) phone?: string | null;
  @term('5', 'Retention held from each bill') retentionPct?: string | null;
  @term('0', 'Security deposit deducted from each bill') securityDepositPct?: string | null;
  @term('2', 'Income-tax TDS (194C)') tdsPct?: string | null;
  @term('2', 'GST TDS (a government client)') gstTdsPct?: string | null;
  @term('1', 'Labour welfare cess') labourCessPct?: string | null;
  @term('18', 'GST charged on bills') gstRate?: string | null;
  @ApiPropertyOptional({ example: 12, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(120) defectLiabilityMonths?: number | null;
  @ApiPropertyOptional({ example: 60, nullable: true, description: 'Days the client takes to pay a bill once sent' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(365) clientPaymentDays?: number | null;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @ApiPropertyOptional({ description: 'Inactive clients are hidden from pickers' }) @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches name, department, GSTIN and contact person. */
export class ListClientsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Include inactive clients' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: ['name', 'createdAt'], default: 'name' }) @IsOptional() @IsIn(['name', 'createdAt']) sortBy?: 'name' | 'createdAt';
}
