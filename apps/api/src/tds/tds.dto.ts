import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import { TDS_RETURN_FORMS, TDS_SECTION_KEYS, type TdsReturnForm } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const FORMS = TDS_RETURN_FORMS as unknown as string[];
const SECTIONS = TDS_SECTION_KEYS as unknown as string[];
/** Rupees and paise, never negative: the shape every TDS amount takes on the way in. */
const MONEY = /^\d{1,13}(\.\d{1,2})?$/;
/** A rate in percent with up to three places (0.1 for 194Q, 0.75 on a certificate). */
const RATE = /^\d{1,2}(\.\d{1,3})?$|^100(\.0{1,3})?$/;

export class QuarterQuery {
  @ApiProperty({ enum: TDS_RETURN_FORMS }) @IsIn(FORMS, { message: 'Choose 26Q or 24Q' }) form: TdsReturnForm;
  @ApiProperty({ example: '2026-07-01', description: "The quarter's first day" }) @IsDateString({}, { message: 'Choose the quarter' }) periodFrom: string;
}

export class RecordChallanDto {
  @ApiProperty({ enum: TDS_RETURN_FORMS }) @IsIn(FORMS, { message: 'Choose 26Q or 24Q' }) form: TdsReturnForm;
  @ApiProperty({ example: '0510308', description: "The bank branch's BSR code, 7 digits" }) @trim() @IsString() @Matches(/^\d{7}$/, { message: 'Enter the 7 digit BSR code from the challan' }) bsrCode: string;
  @ApiProperty({ example: '00412', description: "The challan's serial number, up to 5 digits" }) @trim() @IsString() @Matches(/^\d{1,5}$/, { message: 'Enter the challan serial number, up to 5 digits' }) challanSerial: string;
  @ApiProperty({ example: '2026-08-06' }) @IsDateString({}, { message: 'Choose the day the tax was deposited' }) depositedOn: string;
  @ApiProperty({ type: [String], description: 'The deductions it covers; its tax is their sum' }) @IsArray() @ArrayMinSize(1, { message: 'Choose the deductions this challan covers' }) @ArrayMaxSize(5000) @IsUUID('4', { each: true }) deductionIds: string[];
  @ApiPropertyOptional({ example: '0', description: 'Interest under 201(1A); left out, worked out from the dates' }) @IsOptional() @num() @opt() @Matches(MONEY, { message: 'Enter the interest in rupees' }) interest?: string | null;
  @ApiPropertyOptional({ example: '0', description: 'Late fee under 234E paid on the challan' }) @IsOptional() @num() @opt() @Matches(MONEY, { message: 'Enter the late fee in rupees' }) fee?: string | null;
}

export class FileReturnDto extends QuarterQuery {
  @ApiProperty({ example: '2026-10-28' }) @IsDateString({}, { message: 'Choose the day the return was filed' }) filedOn: string;
  @ApiProperty({ example: '123456789012345', description: 'The 15 digit provisional receipt number' }) @trim() @IsString() @Matches(/^\d{15}$/, { message: 'Enter the 15 digit provisional receipt number' }) receiptNo: string;
}

export class ReopenReturnDto extends QuarterQuery {
  @ApiProperty({ example: 'PAN corrected for one deductee' }) @trim() @IsString() @IsNotEmpty({ message: 'Say what the correction is for' }) @MaxLength(500) note: string;
}

export class ConfirmSectionDto {
  @ApiProperty({ enum: TDS_SECTION_KEYS }) @IsIn(SECTIONS, { message: 'Choose the TDS section' }) section: string;
  @ApiPropertyOptional({ example: '100000', description: 'What the TDS was worked out on; left out, kept' }) @IsOptional() @num() @opt() @Matches(MONEY, { message: 'Enter the amount paid in rupees' }) amountPaid?: string | null;
}

export class CreateCertificateDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the vendor' }) vendorId: string;
  @ApiProperty({ enum: TDS_SECTION_KEYS }) @IsIn(SECTIONS, { message: 'Choose the TDS section' }) section: string;
  @ApiProperty({ example: 'ABCDE1234F2627197' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the certificate number' }) @MaxLength(40) certificateNo: string;
  @ApiProperty({ example: '0.75' }) @num() @Matches(RATE, { message: 'Enter the rate in percent, like 0.75' }) rate: string;
  @ApiProperty({ example: '2026-04-01' }) @IsDateString({}, { message: 'Choose the day it starts' }) validFrom: string;
  @ApiProperty({ example: '2027-03-31' }) @IsDateString({}, { message: 'Choose the day it ends' }) validTo: string;
  @ApiProperty({ example: '2500000', description: 'The amount it covers' }) @num() @Matches(MONEY, { message: 'Enter the amount the certificate covers' }) limit: string;
}

export class SuggestQuery {
  @ApiProperty() @IsUUID('4', { message: 'Choose the vendor' }) vendorId: string;
  @ApiPropertyOptional({ enum: TDS_SECTION_KEYS, description: "Left out, the section last used for the vendor; no answer when there is none" }) @IsOptional() @IsIn(SECTIONS, { message: 'Choose the TDS section' }) section?: string;
  @ApiProperty({ example: '118000', description: 'What the payment settles' }) @num() @Matches(MONEY, { message: 'Enter the amount' }) amount: string;
  @ApiPropertyOptional({ example: '100000', description: 'What TDS is worked out on, when typed' }) @IsOptional() @num() @Matches(MONEY, { message: 'Enter the amount TDS is worked out on' }) base?: string;
  @ApiPropertyOptional({ description: 'The vendor bill paid, whose GST share comes off the base' }) @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() on: string;
  @ApiPropertyOptional({ description: 'The payment being changed, left out of the year before' }) @IsOptional() @IsUUID() paymentId?: string;
}

export class StatementQuery extends QuarterQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
}
