import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  EXPENSE_CATEGORIES,
  GSTIN_PATTERN,
  LIST_SORT_FIELDS,
  PAYMENT_MODES,
  SUBMISSION_STATUSES,
  type ExpenseCategory,
  type ExpenseSortField,
  type PaymentMode,
  type SubmissionStatus,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { VENDOR_ID_DOC } from '../vendors/vendors.dto';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const upper = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value));

export class CreateExpenseDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-13' }) @IsDateString() date: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category: ExpenseCategory;
  @ApiProperty({ example: 'Hydraulic hose for grader GRD-01' }) @trim() @IsString() @IsNotEmpty() @MaxLength(300) description: string;
  @ApiPropertyOptional({ example: 'Sahoo Auto Parts' }) @IsOptional() @trim() @IsString() @MaxLength(200) vendor?: string | null;
  @ApiPropertyOptional(VENDOR_ID_DOC) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ example: '21ABCDE1234F1Z5' })
  @IsOptional()
  @upper()
  @ValidateIf((_, v) => v !== null)
  @Matches(GSTIN_PATTERN, { message: 'vendorGstin must be a valid 15-character GSTIN' })
  vendorGstin?: string | null;
  @ApiPropertyOptional({ example: 'INV-2231' }) @IsOptional() @trim() @IsString() @MaxLength(60) billNo?: string | null;
  @ApiProperty({ example: '2400.00', description: 'Taxable value (before GST)' }) @num() @IsNumberString() amount: string;
  @ApiPropertyOptional({ example: '18', default: '0', description: 'GST rate in percent (0 to 28)' }) @IsOptional() @num() @IsNumberString() gstRate?: string;
  @ApiPropertyOptional({ example: '432.00', description: 'GST as on the bill; computed from the rate when omitted (must be within ₹1 of it)' })
  @IsOptional()
  @num()
  @ValidateIf((_, v) => v !== null)
  @IsNumberString()
  gstAmount?: string | null;
  @ApiPropertyOptional({ enum: PAYMENT_MODES, default: 'CASH' }) @IsOptional() @IsIn(PAYMENT_MODES as unknown as string[]) paymentMode?: PaymentMode;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Bill / receipt photos' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  /** When true the expense is created and immediately submitted for approval. */
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

/** `q` matches expense number, description, vendor, bill number, project and submitter names. */
export class ListExpensesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES }) @IsOptional() @IsIn(EXPENSE_CATEGORIES as unknown as string[]) category?: ExpenseCategory;
  @ApiPropertyOptional({ enum: PAYMENT_MODES }) @IsOptional() @IsIn(PAYMENT_MODES as unknown as string[]) paymentMode?: PaymentMode;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only expenses without a bill photo' }) @IsOptional() @QueryBool() @IsBoolean() noReceipt?: boolean;
  @ApiPropertyOptional({ description: 'Only expenses created by the current user' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.expenses, default: 'date' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.expenses as unknown as string[]) sortBy?: ExpenseSortField;
}
