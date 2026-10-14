import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIST_SORT_FIELDS, RECEIPT_MODES, type PaymentMode, type VendorPaymentSortField } from '@erp/shared';
import { PageQuery } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/** Everything but the date and amount, which a new payment must have and an edit may leave out. */
export class PaymentFieldsDto {
  @ApiPropertyOptional({ enum: RECEIPT_MODES, default: 'BANK' }) @IsOptional() @IsIn(RECEIPT_MODES as unknown as string[]) mode?: PaymentMode;
  @ApiPropertyOptional({ example: 'HDFCN26287512345', description: 'UTR, cheque or voucher number' }) @IsOptional() @trim() @IsString() @MaxLength(100) reference?: string | null;
  @ApiPropertyOptional({ example: '0', description: 'TDS deducted at payment (vendor bills only; a subcontractor bill already deducts its TDS)' }) @IsOptional() @num() @IsNumberString() tdsAmount?: string;
  @ApiPropertyOptional({ example: '0' }) @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CreatePaymentDto extends PaymentFieldsDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ description: 'The vendor bill paid (or give subcontractBillId)' }) @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional({ description: 'The subcontractor bill paid (or give vendorBillId)' }) @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() paymentDate: string;
  @ApiProperty({ example: '125000.00', description: 'Paid out of the bank or cash' }) @num() @IsNumberString() amount: string;
}

export class UpdatePaymentDto extends PaymentFieldsDto {
  @ApiPropertyOptional({ example: '2026-10-20' }) @IsOptional() @IsDateString() paymentDate?: string;
  @ApiPropertyOptional({ example: '125000.00' }) @IsOptional() @num() @IsNumberString() amount?: string;
}

/** `q` matches the reference, remarks, vendor and project. */
export class ListPaymentsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() vendorBillId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() subcontractBillId?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.vendorPayments, default: 'paymentDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.vendorPayments as unknown as string[]) sortBy?: VendorPaymentSortField;
}

export class PayablesQuery {
  @ApiPropertyOptional({ description: 'Only this project' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Only this vendor' }) @IsOptional() @IsUUID() vendorId?: string;
}
