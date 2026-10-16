import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { BILL_STAGES, LIST_SORT_FIELDS, SUBMISSION_STATUSES, type BillSortField, type BillStage, type SubmissionStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));

export class CreateRaBillDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() billDate: string;
  @ApiPropertyOptional({ example: '2026-10-13', description: 'Approved measurements dated up to this day (default the bill date) and not in an earlier bill are billed' })
  @IsOptional()
  @IsDateString()
  measuredUpTo?: string;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isFinal?: boolean;
  @ApiPropertyOptional({ example: '0', description: 'Any other deduction the client makes (₹)' }) @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false, description: 'Submit for approval straight away' }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateRaBillDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() billDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() measuredUpTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFinal?: boolean;
  @ApiPropertyOptional() @IsOptional() @num() @IsNumberString() otherDeduction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) otherDeductionNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class BillDateDto {
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() date: string;
}

export class CertifiedItemDto {
  @ApiProperty() @IsUUID() boqItemId: string;
  @ApiProperty({ example: '120.5', description: 'Quantity of this bill the client passed' }) @num() @IsNumberString() certifiedQty: string;
}

export class PvIndexDto {
  @ApiProperty({ description: "A component of the contract's price variation formula" }) @IsUUID() componentId!: string;
  @ApiProperty({ example: '151.2', description: "The component's index for this bill" })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  @IsNumberString()
  currentIndex!: string;
}

/** This bill's index for each component; an empty list clears the price variation. */
export class BillPriceVariationDto {
  @ApiPropertyOptional({ example: '2026-03-01', description: 'The month the indices are for' }) @IsOptional() @IsDateString() indexMonth?: string | null;
  @ApiPropertyOptional({ example: 'RBI WPI, March 2026 (provisional)' }) @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
  @ApiProperty({ type: [PvIndexDto] }) @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => PvIndexDto) indices!: PvIndexDto[];
}

export class CertifyBillDto extends BillDateDto {
  @ApiPropertyOptional({ example: 'EE/RD/2026/114' }) @IsOptional() @trim() @IsString() @MaxLength(100) certificateNo?: string | null;
  @ApiPropertyOptional({ type: [CertifiedItemDto], description: 'Items the client cut; items left out are certified as claimed' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CertifiedItemDto)
  items?: CertifiedItemDto[];
}

/** `q` matches the project, its client, the certificate number and remarks. */
export class ListRaBillsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional({ enum: BILL_STAGES }) @IsOptional() @IsIn(BILL_STAGES as unknown as string[]) stage?: BillStage;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.bills, default: 'billDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.bills as unknown as string[]) sortBy?: BillSortField;
  @ApiPropertyOptional({ example: '2026-10-01', description: 'From this day (inclusive)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-31', description: 'Up to this day (inclusive)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Only entries the current user submitted' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}
