import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { EQUIPMENT_LOAN_STATUSES, LOAN_DISBURSALS, LOAN_MAX_MONTHS, LOAN_MAX_RATE, PAYMENT_MODES, type EquipmentLoanStatus, type LoanDisbursal, type PaymentMode } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Money = (message: string) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message }), Min(0.01, { message }), Max(10_000_000_000)].forEach((d) => d(target, key));
const PAY_MODES = PAYMENT_MODES.filter((m) => m !== 'CREDIT');

/** The terms of a loan: the schedule is built from them. */
export class LoanTermsInput {
  @ApiProperty({ example: 3800000 }) @Money('Enter the amount of the loan') amount: number;
  @ApiProperty({ example: 9.25, description: 'Yearly rate, %' }) @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the yearly rate, e.g. 9.25' }) @Min(0) @Max(LOAN_MAX_RATE) ratePct: number;
  @ApiProperty({ example: 48 }) @IsInt({ message: 'Enter the tenure in whole months' }) @Min(1) @Max(LOAN_MAX_MONTHS) tenureMonths: number;
  @ApiPropertyOptional({ example: 95060, description: "The lender's EMI; left out, worked out from the terms (to the rupee)" }) @IsOptional() @opt() @Money('Enter the EMI') emi?: number | null;
  @ApiProperty({ example: '2026-11-05' }) @IsDateString({}, { message: 'Choose the date of the first EMI' }) firstEmiDate: string;
  @ApiProperty({ example: '2026-10-10' }) @IsDateString({}, { message: 'Choose the sanction date' }) sanctionDate: string;
}

export class CreateEquipmentLoanDto extends LoanTermsInput {
  @ApiProperty() @IsUUID('4', { message: 'Choose the machine' }) equipmentId: string;
  @ApiProperty({ example: 'HDFC Bank' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the lender, e.g. HDFC Bank' }) @MaxLength(120) lenderName: string;
  @ApiPropertyOptional({ description: 'The lender in the vendor master, when it is one' }) @IsOptional() @opt() @IsUUID() vendorId?: string | null;
  @ApiProperty({ example: 'CEL-55102938' }) @trim() @IsString() @IsNotEmpty({ message: "Enter the lender's loan account number" }) @MaxLength(60) loanNo: string;
  @ApiPropertyOptional({ enum: LOAN_DISBURSALS, default: 'MACHINE_COST' }) @IsOptional() @IsIn(LOAN_DISBURSALS as unknown as string[]) disbursal?: LoanDisbursal;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

/** The terms change only until the first EMI is paid; the lender, its account number and the note any time. */
export class UpdateEquipmentLoanDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the lender, e.g. HDFC Bank' }) @MaxLength(120) lenderName?: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: "Enter the lender's loan account number" }) @MaxLength(60) loanNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4', { message: 'Choose the machine' }) equipmentId?: string;
  @ApiPropertyOptional({ enum: LOAN_DISBURSALS }) @IsOptional() @IsIn(LOAN_DISBURSALS as unknown as string[]) disbursal?: LoanDisbursal;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @Money('Enter the amount of the loan') amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the yearly rate, e.g. 9.25' }) @Min(0) @Max(LOAN_MAX_RATE) ratePct?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt({ message: 'Enter the tenure in whole months' }) @Min(1) @Max(LOAN_MAX_MONTHS) tenureMonths?: number;
  @ApiPropertyOptional() @IsOptional() @opt() @Money('Enter the EMI') emi?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Choose the date of the first EMI' }) firstEmiDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Choose the sanction date' }) sanctionDate?: string;
}

export class LoanPreviewQuery extends LoanTermsInput {}

export class EquipmentLoanQuery {
  @ApiPropertyOptional({ enum: EQUIPMENT_LOAN_STATUSES }) @IsOptional() @IsIn(EQUIPMENT_LOAN_STATUSES as unknown as string[]) status?: EquipmentLoanStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ description: 'Lender, loan number, machine code or name' }) @IsOptional() @trim() @IsString() @MaxLength(100) q?: string;
}

export class PayEmiDto {
  @ApiPropertyOptional({ description: 'The EMI; left out, the next one unpaid' }) @IsOptional() @IsInt() @Min(1) no?: number;
  @ApiProperty({ example: '2026-11-05' }) @IsDateString({}, { message: 'Choose the day it was paid' }) paidOn: string;
  @ApiPropertyOptional({ enum: PAY_MODES, default: 'BANK' }) @IsOptional() @IsIn(PAY_MODES) mode?: PaymentMode;
  @ApiPropertyOptional({ example: 'NACH debit 05-11' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(100) reference?: string | null;
}

/** Repay all that is owed with the next EMI. */
export class ForecloseDto extends PayEmiDto {
  @ApiPropertyOptional({ description: "Interest the lender charges with it; left out, the month's interest" }) @IsOptional() @opt() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000_000) interest?: number | null;
}
