import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { GSTIN_PATTERN, PAN_PATTERN } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));
const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));

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
}

export class UpdateClientDto extends PartialType(CreateClientDto) {
  @ApiPropertyOptional({ description: 'Inactive clients are hidden from pickers' }) @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches name, department, GSTIN and contact person. */
export class ListClientsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Include inactive clients' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: ['name', 'createdAt'], default: 'name' }) @IsOptional() @IsIn(['name', 'createdAt']) sortBy?: 'name' | 'createdAt';
}
