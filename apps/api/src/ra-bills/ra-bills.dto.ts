import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateNested, Max, Min } from 'class-validator';
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
  @ApiPropertyOptional({ example: 2, description: 'An O&M bill: the O&M year, with omInstalment; it bills that period, so measuredUpTo is ignored' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  omYear?: number;
  @ApiPropertyOptional({ example: 3, description: 'The instalment of the O&M year (1 to the instalments a year)' }) @IsOptional() @IsInt() @Min(1) @Max(12) omInstalment?: number;
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

export class CertifiedStageDto {
  @ApiProperty() @IsUUID() stageId: string;
  @ApiProperty({ example: '12.5', description: "This bill's % of the stage the client passed" }) @num() @IsNumberString() certifiedPct: string;
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

export class SecuredAdvanceLineDto {
  @ApiPropertyOptional({ description: "The item master's item, when picked" }) @IsOptional() @IsUUID() itemId?: string | null;
  @ApiProperty({ example: 'Cement OPC 53 grade' }) @trim() @IsString() @MaxLength(300) description!: string;
  @ApiProperty({ example: 'Bag' }) @trim() @IsString() @MaxLength(30) unit!: string;
  @ApiProperty({ example: '1200', description: 'Brought to site for the work and not yet used' }) @num() @IsNumberString() qtyAtSite!: string;
  @ApiProperty({ example: '410', description: 'The rate it was bought at (₹)' }) @num() @IsNumberString() rate!: string;
}

/** The material at site this bill pays a secured advance on; an empty list takes it off. */
export class BillSecuredAdvanceDto {
  @ApiProperty({ type: [SecuredAdvanceLineDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SecuredAdvanceLineDto) lines!: SecuredAdvanceLineDto[];
}

export class BillHoldDto {
  @ApiPropertyOptional({ description: 'A hold already on this bill, to change it; left out for a new one' }) @IsOptional() @IsUUID() id?: string;
  @ApiPropertyOptional({ description: 'The BOQ item in dispute, when it is one' }) @IsOptional() @IsUUID() boqItemId?: string | null;
  @ApiProperty({ example: 'Extra lead on earthwork, item 2.04' }) @trim() @IsString() @MaxLength(300) description!: string;
  @ApiProperty({ example: 'Lead beyond 5 km not accepted by the EE pending the SE’s decision' }) @trim() @IsString() @MaxLength(500) reason!: string;
  @ApiProperty({ example: '185000' }) @num() @IsNumberString() amount!: string;
}

export class BillHoldReleaseDto {
  @ApiProperty({ description: 'A hold placed on an earlier bill of the project' }) @IsUUID() holdId!: string;
  @ApiProperty({ example: '148000' }) @num() @IsNumberString() amount!: string;
  @ApiPropertyOptional({ example: 'SE allowed 80% on interim certificates' }) @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

/** What this bill withholds for disputed items and what it releases of earlier holds; each list replaces the bill's own. */
export class BillHoldsDto {
  @ApiProperty({ type: [BillHoldDto] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BillHoldDto) holds!: BillHoldDto[];
  @ApiProperty({ type: [BillHoldReleaseDto] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => BillHoldReleaseDto) releases!: BillHoldReleaseDto[];
}

export class CloseHoldDto {
  @ApiProperty({ example: '2026-11-08', description: 'The day the rest was given up' }) @IsDateString() date!: string;
  @ApiPropertyOptional({ example: 'SE rejected the claim; not taken to arbitration' }) @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class ListHoldsQuery {
  @ApiProperty() @IsUUID() projectId!: string;
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
  @ApiPropertyOptional({ type: [CertifiedStageDto], description: 'Stages the client cut; stages left out are certified as claimed' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CertifiedStageDto)
  stages?: CertifiedStageDto[];
  @ApiPropertyOptional({ type: [BillHoldDto], description: 'What the engineer withheld on the certificate for disputed items; replaces the holds on this bill. Left out keeps them.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BillHoldDto)
  holds?: BillHoldDto[];
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
