import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { BANK_FILE_FORMAT_KEYS, type BankFileFormatKey } from '@erp/shared';

const account = () => Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value));
const ACCOUNT_RULE = { message: 'Enter the account number the bank debits, 6 to 20 letters and digits' };

export class CreatePaymentBatchDto {
  @ApiProperty({ example: '50200012345678', description: 'The company account the bank debits' }) @account() @Matches(/^[0-9A-Z]{6,20}$/, ACCOUNT_RULE) debitAccount: string;
  @ApiProperty({ enum: BANK_FILE_FORMAT_KEYS, example: 'GENERIC' }) @IsIn(BANK_FILE_FORMAT_KEYS) format: BankFileFormatKey;
}

export class UpdatePaymentBatchDto {
  @ApiPropertyOptional({ example: '50200012345678' }) @IsOptional() @account() @Matches(/^[0-9A-Z]{6,20}$/, ACCOUNT_RULE) debitAccount?: string;
  @ApiPropertyOptional({ enum: BANK_FILE_FORMAT_KEYS }) @IsOptional() @IsIn(BANK_FILE_FORMAT_KEYS) format?: BankFileFormatKey;
}

export class AddBatchLinesDto {
  @ApiProperty({ type: [String], description: 'Approved payment requests to pay in this batch' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) paymentRequestIds: string[];
}

export class ImportUtrsDto {
  @ApiProperty({ description: "The bank's response file or a pasted list, row by row as cells" }) @IsArray() @ArrayMaxSize(5000) @IsArray({ each: true }) cells: unknown[][];
}
