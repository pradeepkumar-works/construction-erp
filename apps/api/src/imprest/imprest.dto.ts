import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PAYMENT_MODES, type PaymentMode } from '@erp/shared';
import { QueryBool } from '../common/paging';

const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const NON_CREDIT = PAYMENT_MODES.filter((m) => m !== 'CREDIT');

export class ListImprestsQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only the caller\'s own imprests' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ description: 'true (default): open imprests; false: closed ones' }) @IsOptional() @QueryBool() @IsBoolean() active?: boolean;
}

export class OpenImprestDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ description: 'The site in-charge who holds the cash' }) @IsUUID() holderId: string;
  @ApiProperty({ example: '25000' }) @num() @IsNumberString() floatAmount: string;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Cash expenses from this day on count against the float; today when omitted' })
  @IsOptional() @IsDateString() @dateOnly()
  openedOn?: string;
  @ApiPropertyOptional({ description: 'Pay the float now: an advance of the full float' }) @IsOptional() @IsBoolean() payFloat?: boolean;
  @ApiPropertyOptional({ enum: NON_CREDIT, default: 'CASH' }) @IsOptional() @IsIn(NON_CREDIT) paymentMode?: PaymentMode;
  @ApiPropertyOptional({ example: 'UTR 4521' }) @IsOptional() @trim() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class UpdateImprestDto {
  @ApiPropertyOptional({ example: '30000' }) @IsOptional() @num() @IsNumberString() floatAmount?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
  @ApiPropertyOptional({ description: 'false closes the imprest (the cash in hand must be nil and no top-up waiting); true opens it again' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RequestTopUpDto {
  @ApiPropertyOptional({ example: '18500', description: 'Defaults to what brings the cash in hand back to the float' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ example: 'Diesel for the DG and the week\'s tea' }) @IsOptional() @trim() @IsString() @MaxLength(500) reason?: string;
}

export class PayDto {
  @ApiPropertyOptional({ example: '18500', description: 'Pay a different amount than asked for' }) @IsOptional() @num() @IsNumberString() amount?: string;
  @ApiPropertyOptional({ example: '2026-10-15', description: 'Today when omitted' }) @IsOptional() @IsDateString() @dateOnly() paidOn?: string;
  @ApiPropertyOptional({ enum: NON_CREDIT, default: 'BANK' }) @IsOptional() @IsIn(NON_CREDIT) paymentMode?: PaymentMode;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class AdvanceDto {
  @ApiProperty({ example: '10000' }) @num() @IsNumberString() amount: string;
  @ApiPropertyOptional({ example: '2026-10-15', description: 'Today when omitted' }) @IsOptional() @IsDateString() @dateOnly() paidOn?: string;
  @ApiPropertyOptional({ enum: NON_CREDIT, default: 'BANK' }) @IsOptional() @IsIn(NON_CREDIT) paymentMode?: PaymentMode;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) reference?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class RejectDto {
  @ApiProperty({ example: 'Submit last week\'s bills first' }) @trim() @IsString() @MaxLength(500) note: string;
}

export class ReturnDto {
  @ApiProperty({ example: '2500' }) @num() @IsNumberString() amount: string;
  @ApiPropertyOptional({ example: '2026-10-15' }) @IsOptional() @IsDateString() @dateOnly() date?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}
