import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MANUAL_PAYSLIP_CODES, PAID_DAYS_BASES, PT_RULES, STAFF_LOAN_KINDS, TAX_REGIMES, type ManualPayslipCode, type PaidDaysBasis, type StaffLoanKind, type TaxRegime } from '@erp/shared';
import { QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const rupees = (max = 100_000_000) => [IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter an amount in rupees' }), Min(0), Max(max)];
const Money = (max?: number) => (target: object, key: string) => rupees(max).forEach((d) => d(target, key));
const Pct = () => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }), Min(0), Max(100)].forEach((d) => d(target, key));

export class PayrollSettingsDto {
  @ApiPropertyOptional({ example: 12 }) @IsOptional() @Pct() pfEmployeePct?: number;
  @ApiPropertyOptional({ example: 12 }) @IsOptional() @Pct() pfEmployerPct?: number;
  @ApiPropertyOptional({ example: 8.33 }) @IsOptional() @Pct() epsPct?: number;
  @ApiPropertyOptional({ example: 15000 }) @IsOptional() @Money(1_000_000) pfWageCeiling?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() pfCapAtCeiling?: boolean;
  @ApiPropertyOptional({ example: 0.75 }) @IsOptional() @Pct() esiEmployeePct?: number;
  @ApiPropertyOptional({ example: 3.25 }) @IsOptional() @Pct() esiEmployerPct?: number;
  @ApiPropertyOptional({ example: 21000 }) @IsOptional() @Money(1_000_000) esiGrossCeiling?: number;
  @ApiPropertyOptional({ example: '21', description: 'GST state code for professional tax; null = none' })
  @IsOptional()
  @opt()
  @IsIn(Object.keys(PT_RULES), { message: 'Choose a state that charges professional tax, or none' })
  ptState?: string | null;
  @ApiPropertyOptional({ enum: PAID_DAYS_BASES }) @IsOptional() @IsIn(PAID_DAYS_BASES as unknown as string[]) paidDaysBasis?: PaidDaysBasis;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(4) overtimeMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @Matches(/^\d{6,18}$/, { message: 'The account number is 6 to 18 digits' }) debitAccountNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(80) debitBankName?: string | null;
}

export class CreateSalaryStructureDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() effectiveFrom: string;
  @ApiProperty({ example: 15000, description: 'Monthly basic' }) @Money() basic: number;
  @ApiPropertyOptional() @IsOptional() @Money() da?: number;
  @ApiPropertyOptional() @IsOptional() @Money() hra?: number;
  @ApiPropertyOptional() @IsOptional() @Money() conveyance?: number;
  @ApiPropertyOptional() @IsOptional() @Money() special?: number;
  @ApiPropertyOptional() @IsOptional() @Money() otherEarnings?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() pf?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() esi?: boolean;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() pt?: boolean;
  @ApiPropertyOptional({ enum: TAX_REGIMES }) @IsOptional() @IsIn(TAX_REGIMES as unknown as string[]) taxRegime?: TaxRegime;
  @ApiPropertyOptional({ description: 'Old regime: deductions for the year beyond PF (80C, 80D, home loan interest)' }) @IsOptional() @Money() declaredDeductions?: number;
  @ApiPropertyOptional({ description: 'Other income or earlier salary this year, for TDS' }) @IsOptional() @Money() otherIncome?: number;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class StructureQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
}

export class CreateStaffLoanDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiProperty({ enum: STAFF_LOAN_KINDS }) @IsIn(STAFF_LOAN_KINDS as unknown as string[]) kind: StaffLoanKind;
  @ApiProperty({ example: '2026-10-05' }) @IsDateString() issuedOn: string;
  @ApiProperty({ example: 50000 }) @Money() @Min(1, { message: 'Enter the amount lent' }) amount: number;
  @ApiProperty({ example: 5000, description: 'Taken from each month’s salary' }) @Money() @Min(1, { message: 'Enter how much to recover each month' }) emi: number;
  @ApiProperty({ example: '2026-11', description: 'First month recovered' }) @Matches(MONTH, { message: 'Choose the first month to recover it' }) startMonth: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class LoanQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional({ description: 'Only those with something left to recover' }) @IsOptional() @QueryBool() @IsBoolean() open?: boolean;
}

export class CreateRunDto {
  @ApiProperty({ example: '2026-10' }) @Matches(MONTH, { message: 'Choose the month' }) month: string;
  @ApiPropertyOptional({ description: 'One site’s staff only; left out for the whole company' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
}

export class RunQuery {
  @ApiPropertyOptional({ example: '2026-10' }) @IsOptional() @Matches(MONTH) month?: string;
}

export class RunNoteDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

export class SendBackDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Say what needs changing' }) @MaxLength(500) note: string;
}

export class PayRunDto {
  @ApiProperty({ example: '2026-11-01' }) @IsDateString() paidOn: string;
  @ApiPropertyOptional({ example: 'NEFT batch 4471' }) @IsOptional() @trim() @IsString() @MaxLength(80) paymentRef?: string | null;
}

export class AdjustmentLineDto {
  @ApiProperty({ enum: MANUAL_PAYSLIP_CODES }) @IsIn(MANUAL_PAYSLIP_CODES as unknown as string[]) code: ManualPayslipCode;
  @ApiPropertyOptional({ example: 'Diwali bonus' }) @IsOptional() @trim() @IsString() @MaxLength(60) label?: string;
  @ApiProperty({ example: 2000 }) @Money(10_000_000) @Min(1, { message: 'Enter the amount' }) amount: number;
}

export class PayslipAdjustmentsDto {
  @ApiProperty({ type: [AdjustmentLineDto], description: 'The complete list of lines added by hand' })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

export class PrepareSettlementDto {
  @ApiProperty() @IsUUID() employeeId: string;
  @ApiPropertyOptional({ description: 'Anything else owed to them (bonus, reimbursements)' }) @IsOptional() @Money() otherEarnings?: number;
  @ApiPropertyOptional({ description: 'Anything else they owe (equipment not returned)' }) @IsOptional() @Money() otherDeductions?: number;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}
