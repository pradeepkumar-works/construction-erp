import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIST_SORT_FIELDS, RECEIPT_KINDS, RECEIPT_MODES, type PaymentMode, type ReceiptKind, type ReceiptSortField } from '@erp/shared';
import { PageQuery } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

/** Everything but the date and amount, which a new receipt must have and an edit may leave out. */
export class ReceiptFieldsDto {
  @ApiPropertyOptional({ enum: RECEIPT_MODES, default: 'BANK' }) @IsOptional() @IsIn(RECEIPT_MODES as unknown as string[]) mode?: PaymentMode;
  @ApiPropertyOptional({ example: 'SBIN526291234567', description: 'UTR, cheque or advice number' }) @IsOptional() @trim() @IsString() @MaxLength(100) reference?: string | null;
  @ApiPropertyOptional({ example: '19800.00' }) @IsOptional() @num() @IsNumberString() tdsAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() gstTdsAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() retentionAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() securityDepositAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() advanceRecoveryAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() labourCessAmount?: string;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class CreateReceiptDto extends ReceiptFieldsDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiPropertyOptional({ enum: RECEIPT_KINDS, default: 'BILL' }) @IsOptional() @IsIn(RECEIPT_KINDS as unknown as string[]) kind?: ReceiptKind;
  @ApiPropertyOptional({ description: 'The bill paid (kind BILL)' }) @IsOptional() @IsUUID() billId?: string;
  @ApiPropertyOptional({ description: 'The project (releases; taken from the bill otherwise)' }) @IsOptional() @IsUUID() projectId?: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() receiptDate: string;
  @ApiProperty({ example: '968700.00', description: 'Credited to the bank' }) @num() @IsNumberString() amount: string;
}

export class UpdateReceiptDto extends ReceiptFieldsDto {
  @ApiPropertyOptional({ example: '2026-10-20' }) @IsOptional() @IsDateString() receiptDate?: string;
  @ApiPropertyOptional({ example: '968700.00' }) @IsOptional() @num() @IsNumberString() amount?: string;
}

/** `q` matches the reference, remarks, project and client. */
export class ListReceiptsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() billId?: string;
  @ApiPropertyOptional({ enum: RECEIPT_KINDS }) @IsOptional() @IsIn(RECEIPT_KINDS as unknown as string[]) kind?: ReceiptKind;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.receipts, default: 'receiptDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.receipts as unknown as string[]) sortBy?: ReceiptSortField;
}

export class ReceivablesQuery {
  @ApiPropertyOptional({ description: 'Only this project' }) @IsOptional() @IsUUID() projectId?: string;
}
