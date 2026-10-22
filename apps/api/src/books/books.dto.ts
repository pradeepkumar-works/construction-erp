import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ACCOUNT_GROUPS, BOOK_SOURCES, BOOK_VOUCHER_STATUSES, BOOK_VOUCHER_TYPES, MANUAL_VOUCHER_TYPES, type AccountGroup, type BookSource, type BookVoucherStatus, type BookVoucherType, type ManualVoucherType } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Amount = () => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' }), Min(0), Max(10_000_000_000)].forEach((d) => d(target, key));

export class CreateAccountDto {
  @ApiProperty({ example: 'HDFC Bank current account' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the account name' }) @MaxLength(120) name: string;
  @ApiProperty({ enum: ACCOUNT_GROUPS }) @IsIn(ACCOUNT_GROUPS as unknown as string[], { message: 'Choose the group' }) group: AccountGroup;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(20) code?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) description?: string | null;
}

export class UpdateAccountDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the account name' }) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: ACCOUNT_GROUPS }) @IsOptional() @IsIn(ACCOUNT_GROUPS as unknown as string[]) group?: AccountGroup;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(20) code?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AccountQuery {
  @ApiPropertyOptional({ description: 'Balances up to this day (YYYY-MM-DD); all dates when left out' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only lines of this project (cost centre)' }) @IsOptional() @IsUUID() projectId?: string;
}

export class LedgerQuery {
  @ApiProperty() @IsUUID() accountId: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class DayBookQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: BOOK_VOUCHER_TYPES }) @IsOptional() @IsIn(BOOK_VOUCHER_TYPES as unknown as string[]) type?: BookVoucherType;
  @ApiPropertyOptional({ enum: BOOK_SOURCES }) @IsOptional() @IsIn(BOOK_SOURCES as unknown as string[]) source?: BookSource;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class VoucherQuery extends PageQuery {
  @ApiPropertyOptional({ enum: BOOK_VOUCHER_STATUSES }) @IsOptional() @IsIn(BOOK_VOUCHER_STATUSES as unknown as string[]) status?: BookVoucherStatus;
  @ApiPropertyOptional({ description: 'Only those waiting for the caller to decide' }) @IsOptional() @QueryBool() toDecide?: boolean;
}

export class VoucherLineDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the account' }) accountId: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount() debit?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount() credit?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) narration?: string | null;
}

export class SaveVoucherDto {
  @ApiProperty({ enum: MANUAL_VOUCHER_TYPES }) @IsIn(MANUAL_VOUCHER_TYPES as unknown as string[], { message: 'Choose journal, payment, receipt or contra' }) type: ManualVoucherType;
  @ApiProperty({ example: '2026-10-22' }) @IsDateString() date: string;
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Say what the voucher is for' }) @MaxLength(1000) narration: string;
  @ApiPropertyOptional({ description: 'Cheque, UTR or bill number' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(100) reference?: string | null;
  @ApiPropertyOptional({ description: 'The project every line is for, unless a line names its own' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiProperty({ type: [VoucherLineDto] }) @IsArray() @ArrayMinSize(2, { message: 'A voucher needs at least two lines' }) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => VoucherLineDto) lines: VoucherLineDto[];
}

export class VoucherNoteDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string;
}

export class VoucherReasonDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Say why' }) @MaxLength(1000) note: string;
}
