import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { PROJECT_TYPES, SOR_BOOK_KINDS, TENDER_BID_TYPES, TENDER_LINE_KINDS, TENDER_STATUSES, type ProjectType, type SorBookKind, type TenderBidType, type TenderLineKind, type TenderStatus } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const Amount = (message: string, min = 0) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message }), Min(min, { message }), Max(1e13, { message })].forEach((d) => d(target, key));
const Pct = (message: string) => (target: object, key: string) => [IsNumber({ maxDecimalPlaces: 2 }, { message }), Min(0, { message }), Max(100, { message })].forEach((d) => d(target, key));

// ---------------------------------------------------------------------------------------------------------------------
// Schedules of rates

export class SorBookInput {
  @ApiProperty({ example: 'Odisha SOR 2024-25' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the schedule, e.g. Odisha SOR 2024-25' }) @MaxLength(120) name: string;
  @ApiProperty({ enum: SOR_BOOK_KINDS }) @IsIn(SOR_BOOK_KINDS as unknown as string[], { message: 'Choose where the rates come from' }) kind: SorBookKind;
  @ApiPropertyOptional({ example: '2024-25' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(40) edition?: string | null;
  @ApiPropertyOptional({ example: 'Odisha, Works Department' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(120) region?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

export class UpdateSorBookDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the schedule, e.g. Odisha SOR 2024-25' }) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: SOR_BOOK_KINDS }) @IsOptional() @IsIn(SOR_BOOK_KINDS as unknown as string[]) kind?: SorBookKind;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(40) edition?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(120) region?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(500) note?: string | null;
}

/** One row of a schedule as read from Excel; checked again on the server. */
export class SorRowInput {
  @ApiProperty({ example: '4.1.3' }) @IsString() @MaxLength(40) code: string;
  @ApiPropertyOptional({ example: 'Concrete' }) @IsOptional() @IsString() @MaxLength(120) chapter?: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty({ example: 'cum' }) @IsString() @MaxLength(20) unit: string;
  @ApiProperty({ example: '6200.00' }) @IsString() @MaxLength(20) rate: string;
}

export class SorImportDto {
  @ApiProperty({ type: [SorRowInput] }) @IsArray() @ArrayMaxSize(5000, { message: 'Import at most 5,000 rows at a time' }) @ValidateNested({ each: true }) @Type(() => SorRowInput) rows: SorRowInput[];
}

export class SorItemQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() bookId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @ApiPropertyOptional({ description: 'Pickers send it; items always come in schedule order' }) @IsOptional() @IsString() sortBy?: string;
}

export class UpdateSorItemDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Describe the item' }) @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the unit, e.g. cum' }) @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(120) chapter?: string | null;
  @ApiPropertyOptional() @IsOptional() @Amount('Enter the rate, zero or more') rate?: number;
}

// ---------------------------------------------------------------------------------------------------------------------
// Tenders

export class TenderQuery {
  @ApiPropertyOptional({ description: 'open (preparing or awaiting the result, the default), closed, all, or one status' })
  @IsOptional()
  @IsIn(['open', 'closed', 'all', ...TENDER_STATUSES])
  status?: 'open' | 'closed' | 'all' | TenderStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ description: "A vertical's code (item 167), or `none` for tenders with none" }) @IsOptional() @IsString() @MaxLength(60) vertical?: string;
}

export class TenderFieldsInput {
  @ApiPropertyOptional({ example: 'NIT 14/2026-27' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(80) nitNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID('4', { message: 'Choose the client' }) clientId?: string | null;
  @ApiPropertyOptional({ description: 'Free text when the client is not in the client master' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(160) clientName?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(160) location?: string | null;
  @ApiPropertyOptional({ description: 'Its vertical (item 167), a code of the vertical master' }) @IsOptional() @opt() @IsString() @MaxLength(60) verticalCode?: string | null;
  @ApiPropertyOptional({ enum: TENDER_BID_TYPES }) @IsOptional() @IsIn(TENDER_BID_TYPES as unknown as string[]) bidType?: TenderBidType;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID('4', { message: 'Choose the schedule of rates' }) sorBookId?: string | null;
  @ApiPropertyOptional({ example: 48500000 }) @IsOptional() @opt() @Amount('Enter the estimate (put-to-tender value)', 1) estimatedValue?: number | null;
  @ApiPropertyOptional({ example: 18 }) @IsOptional() @opt() @IsInt({ message: 'Enter the time for completion in whole months' }) @Min(1) @Max(240) completionMonths?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString({}, { message: 'Choose the date the tender was published' }) publishedOn?: string | null;
  @ApiPropertyOptional({ example: -4.5, description: 'Percentage tenders: above (+) or below (-) the SOR' })
  @IsOptional()
  @opt()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter the percentage, e.g. -4.5 for 4.5% below' })
  @Min(-99.99)
  @Max(999.99)
  quotedPct?: number | null;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @Pct('Enter overheads between 0 and 100%') overheadPct?: number;
  @ApiPropertyOptional({ example: 8 }) @IsOptional() @Pct('Enter profit between 0 and 100%') profitPct?: number;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount('Enter the tender fee') tenderFee?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ description: 'EMD paid with the bid; with its reference it is kept with the guarantees' }) @IsOptional() @opt() @Amount('Enter the EMD amount', 1) emdAmount?: number | null;
  @ApiPropertyOptional({ example: 'DD 004512' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(80) emdReference?: string | null;
  @ApiPropertyOptional({ example: 'State Bank of India' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(120) emdIssuer?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString({}, { message: 'Choose the date the EMD is valid until' }) emdExpiresOn?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class CreateTenderDto extends TenderFieldsInput {
  @ApiPropertyOptional({ example: 'TND-2026-0007', description: 'Left out, the next number' }) @IsOptional() @trim() @opt() @IsString() @MaxLength(40) tenderNo?: string | null;
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Enter the name of work' }) @MaxLength(300) title: string;
  @ApiProperty({ example: '2026-11-14' }) @IsDateString({}, { message: 'Choose the last date to submit' }) submitBy: string;
}

export class UpdateTenderDto extends TenderFieldsInput {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter our tender number' }) @MaxLength(40) tenderNo?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the name of work' }) @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Choose the last date to submit' }) submitBy?: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString({}, { message: 'Choose the date the bids were opened' }) openedOn?: string | null;
}

export class TenderItemRowInput {
  @ApiProperty({ example: '2.01' }) @IsString() @MaxLength(40) itemNo: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty({ example: 'cum' }) @IsString() @MaxLength(20) unit: string;
  @ApiProperty({ example: '120' }) @IsString() @MaxLength(20) qty: string;
  @ApiPropertyOptional({ example: '4.1.3', description: 'The item in the tender’s schedule of rates' }) @IsOptional() @IsString() @MaxLength(40) sorCode?: string;
  @ApiPropertyOptional({ example: '6200', description: 'The SOR (estimate) rate, when the client’s BOQ gives it' }) @IsOptional() @IsString() @MaxLength(20) sorRate?: string;
}

export class TenderItemImportDto {
  @ApiProperty({ type: [TenderItemRowInput] }) @IsArray() @ArrayMaxSize(3000, { message: 'Import at most 3,000 items at a time' }) @ValidateNested({ each: true }) @Type(() => TenderItemRowInput) items: TenderItemRowInput[];
  @ApiPropertyOptional({ description: 'Replace the bid BOQ (and its rate analysis) instead of adding to it' }) @IsOptional() @IsBoolean() replace?: boolean;
}

export class TenderItemInput {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the item number' }) @MaxLength(40) itemNo?: string;
  @ApiPropertyOptional({ description: 'Left out with an SOR item, its description' }) @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Describe the item' }) @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the unit, e.g. cum' }) @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the quantity' }) @Min(0.001, { message: 'Enter a quantity above zero' }) @Max(1e12) qty?: number;
  @ApiPropertyOptional({ description: 'An item of the tender’s schedule of rates: sets the SOR rate (and the description and unit when left out)' }) @IsOptional() @opt() @IsUUID() sorItemId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount('Enter the SOR rate, zero or more') sorRate?: number | null;
  @ApiPropertyOptional({ description: 'Item-rate tenders: the rate quoted; null quotes the built-up rate' }) @IsOptional() @opt() @Amount('Enter the rate to quote', 0.01) ownRate?: number | null;
}

export class CreateTenderItemDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Enter the item number' }) @MaxLength(40) itemNo: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Enter the quantity' }) @Min(0.001, { message: 'Enter a quantity above zero' }) @Max(1e12) qty: number;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Describe the item' }) @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Enter the unit, e.g. cum' }) @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() sorItemId?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount('Enter the SOR rate, zero or more') sorRate?: number | null;
  @ApiPropertyOptional() @IsOptional() @opt() @Amount('Enter the rate to quote', 0.01) ownRate?: number | null;
}

export class TenderLineInput {
  @ApiProperty({ enum: TENDER_LINE_KINDS }) @IsIn(TENDER_LINE_KINDS as unknown as string[]) kind: TenderLineKind;
  @ApiPropertyOptional({ description: 'A material’s store item (its name, unit and rate unless given)' }) @IsOptional() @opt() @IsUUID() itemId?: string | null;
  @ApiPropertyOptional({ description: 'The material, the trade or the equipment category' }) @IsOptional() @trim() @IsString() @MaxLength(160) name?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) unit?: string;
  @ApiProperty({ example: 3.4 }) @IsNumber({ maxDecimalPlaces: 6 }, { message: 'Enter the quantity for one unit' }) @Min(0.000001, { message: 'Enter a quantity above zero' }) @Max(1e9) qtyPerUnit: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Pct('Enter a wastage between 0 and 100%') wastagePct?: number;
  @ApiPropertyOptional({ description: 'Left out, the item master’s rate, the labour rate or the machines’ rate; null leaves it unpriced' }) @IsOptional() @opt() @Amount('Enter the rate, zero or more') rate?: number | null;
}

export class TenderLinesDto {
  @ApiProperty({ type: [TenderLineInput] }) @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => TenderLineInput) lines: TenderLineInput[];
}

export class TenderLibraryDto {
  @ApiPropertyOptional({ description: 'A starter library entry; left out, the one the description suggests' }) @IsOptional() @IsString() @MaxLength(40) libraryKey?: string;
}

export class SubmitTenderDto {
  @ApiProperty({ example: '2026-11-13' }) @IsDateString({}, { message: 'Choose the date the bid went in' }) submittedOn: string;
}

export class TenderStatusDto {
  @ApiProperty({ enum: TENDER_STATUSES }) @IsIn(TENDER_STATUSES as unknown as string[]) status: TenderStatus;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString({}, { message: 'Choose the date' }) on?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(1000) note?: string | null;
}

export class TenderBidInput {
  @ApiProperty({ example: 'Kalinga Constructions' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the bidder' }) @MaxLength(160) bidderName: string;
  @ApiPropertyOptional({ example: 47200000 }) @IsOptional() @opt() @Amount('Enter the bid amount', 1) amount?: number | null;
  @ApiPropertyOptional({ example: -2.5, description: 'Instead of the amount: above (+) or below (-) the SOR' }) @IsOptional() @opt() @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Enter the percentage, e.g. -2.5' }) @Min(-99.99) @Max(999.99) pct?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) note?: string | null;
}

export class EmdReturnedDto {
  @ApiProperty() @IsDateString({}, { message: 'Choose the date the EMD came back' }) on: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(300) note?: string | null;
}

export class GuaranteeInput {
  @ApiProperty({ example: 'BG 0045/2026' }) @trim() @IsString() @IsNotEmpty({ message: 'Enter the guarantee number' }) @MaxLength(80) reference: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(120) issuer?: string | null;
  @ApiProperty() @Amount('Enter the guarantee amount', 1) amount: number;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString({}, { message: 'Choose the date the guarantee expires' }) expiresOn?: string | null;
}

export class MakeProjectDto {
  @ApiProperty({ example: 'RD-014' }) @trim() @IsString() @MaxLength(30) @IsNotEmpty({ message: 'Enter a project code, e.g. RD-014' }) code: string;
  @ApiPropertyOptional({ description: 'Left out, the name of work' }) @IsOptional() @trim() @IsString() @MaxLength(200) name?: string;
  @ApiProperty({ enum: PROJECT_TYPES.filter((t) => t !== 'PLANT' && t !== 'STORE') })
  @IsIn(PROJECT_TYPES.filter((t) => t !== 'PLANT' && t !== 'STORE'), { message: 'Choose the kind of project' })
  type: ProjectType;
  @ApiPropertyOptional() @IsOptional() @IsDateString({}, { message: 'Choose the start date' }) startDate?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @opt() @IsString() @MaxLength(80) agreementNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() projectManagerId?: string | null;
  @ApiPropertyOptional({ description: 'Add the standard activities for the project type' }) @IsOptional() @IsBoolean() applyTemplate?: boolean;
  @ApiPropertyOptional({ type: GuaranteeInput, description: 'The performance guarantee given on award' }) @IsOptional() @ValidateNested() @Type(() => GuaranteeInput) guarantee?: GuaranteeInput;
}
