import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { GSTIN_PATTERN, IFSC_PATTERN, LIST_SORT_FIELDS, MSME_CATEGORIES, PAN_PATTERN, UDYAM_PATTERN, VENDOR_KINDS, type MsmeCategory, type VendorKind, type VendorSortField } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() || null : value));
const blankNull = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class CreateVendorDto {
  @ApiProperty({ example: 'Maa Tarini Traders' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ enum: VENDOR_KINDS, isArray: true, example: ['SUPPLIER'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VENDOR_KINDS as unknown as string[], { each: true })
  kinds?: VendorKind[];
  @ApiPropertyOptional({ example: '21ABCPT1234F1Z9' }) @IsOptional() @upper() @nullable() @Matches(GSTIN_PATTERN, { message: 'GSTIN must be 15 characters, like 21ABCPT1234F1Z9' }) gstin?: string | null;
  @ApiPropertyOptional({ example: 'ABCPT1234F' }) @IsOptional() @upper() @nullable() @Matches(PAN_PATTERN, { message: 'PAN must be 10 characters, like ABCPT1234F' }) pan?: string | null;
  @ApiPropertyOptional({ example: '21', description: 'GST state code; taken from the GSTIN when one is given' })
  @IsOptional()
  @blankNull()
  @nullable()
  @Matches(/^[0-9]{2}$/, { message: 'State code is two digits' })
  stateCode?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(500) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(120) contactPerson?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @nullable() @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(40) phone?: string | null;
  @ApiPropertyOptional({ description: 'Bank details: roles that pay vendors only' }) @IsOptional() @blankNull() @IsString() @MaxLength(200) bankAccountName?: string | null;
  @ApiPropertyOptional({ example: '39281726354' }) @IsOptional() @upper() @nullable() @Matches(/^[0-9A-Z]{6,20}$/, { message: 'Account number is 6 to 20 letters or digits' }) bankAccountNo?: string | null;
  @ApiPropertyOptional({ example: 'SBIN0001234' }) @IsOptional() @upper() @nullable() @Matches(IFSC_PATTERN, { message: 'IFSC is 11 characters, like SBIN0001234' }) bankIfsc?: string | null;
  @ApiPropertyOptional({ example: 'State Bank of India, Khordha' }) @IsOptional() @blankNull() @IsString() @MaxLength(200) bankName?: string | null;
  @ApiPropertyOptional({ enum: MSME_CATEGORIES }) @IsOptional() @nullable() @IsIn(MSME_CATEGORIES as unknown as string[]) msmeCategory?: MsmeCategory | null;
  @ApiPropertyOptional({ example: 'UDYAM-OD-19-0012345' }) @IsOptional() @upper() @nullable() @Matches(UDYAM_PATTERN, { message: 'Udyam number looks like UDYAM-OD-19-0012345' }) udyamNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @blankNull() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  @ApiPropertyOptional({ description: 'Inactive vendors are hidden from pickers' }) @IsOptional() @IsBoolean() isActive?: boolean;
}

/** `q` matches name, GSTIN, PAN, contact person and phone. */
export class ListVendorsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: VENDOR_KINDS }) @IsOptional() @IsIn(VENDOR_KINDS as unknown as string[]) kind?: VendorKind;
  /** Any of several kinds (a subcontractor picker: subcontractors and labour contractors), comma-separated. */
  @ApiPropertyOptional({ description: 'Comma-separated vendor kinds; a vendor of any of them matches' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value))
  @IsIn(VENDOR_KINDS as unknown as string[], { each: true })
  kinds?: VendorKind[];
  @ApiPropertyOptional({ enum: MSME_CATEGORIES }) @IsOptional() @IsIn(MSME_CATEGORIES as unknown as string[]) msme?: MsmeCategory;
  @ApiPropertyOptional({ description: 'Include inactive vendors' }) @IsOptional() @QueryBool() @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.vendors, default: 'name' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.vendors as unknown as string[]) sortBy?: VendorSortField;
}

/** Fields of an expense, machine or GRN that name a vendor. */
export const VENDOR_ID_DOC = { description: 'The vendor from the vendor master (sets the name); null unlinks and keeps the name as typed. Left out, a name that matches an active vendor links to it.' };
