import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { LIST_SORT_FIELDS, RFI_PRIORITIES, RFI_STATUSES, type RfiPriority, type RfiSortField, type RfiStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class CreateRfiDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Footing F12 level differs between drawings' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) subject: string;
  @ApiProperty({ example: 'STR-GA-101 R2 shows the footing at -1.50 m; ARC-SEC-04 R1 shows -1.80 m. Which level do we follow?' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) question: string;
  @ApiPropertyOptional({ example: 'Follow the structural drawing (-1.50 m).' }) @IsOptional() @trim() @IsString() @MaxLength(2000) proposal?: string | null;
  @ApiPropertyOptional({ example: 'Grid C-4, ground floor' }) @IsOptional() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ enum: RFI_PRIORITIES, default: 'NORMAL' }) @IsOptional() @IsIn(RFI_PRIORITIES as unknown as string[]) priority?: RfiPriority;
  @ApiPropertyOptional({ example: 'Executive Engineer, Odisha Works Department', description: "Addressed to; the project's consultant or client when left out" }) @IsOptional() @trim() @IsString() @MaxLength(200) toParty?: string | null;
  @ApiProperty({ example: '2026-10-21' }) @IsDateString() raisedOn: string;
  @ApiPropertyOptional({ example: '2026-10-28', description: 'Answer needed by; 7 days after raising (2 when urgent) when left out' }) @IsOptional() @IsDateString() replyBy?: string;
  @ApiPropertyOptional({ description: 'The drawing or document it is about' }) @IsOptional() @nullable() @IsUUID() documentId?: string | null;
  @ApiPropertyOptional({ description: 'The BOQ item it is about' }) @IsOptional() @nullable() @IsUUID() boqItemId?: string | null;
  @ApiPropertyOptional({ description: 'The answer may change cost' }) @IsOptional() @IsBoolean() costImpact?: boolean;
  @ApiPropertyOptional({ description: 'The answer may change time' }) @IsOptional() @IsBoolean() timeImpact?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

/** Change an RFI while it waits for its answer. */
export class UpdateRfiDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(200) subject?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(4000) question?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(2000) proposal?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ enum: RFI_PRIORITIES }) @IsOptional() @IsIn(RFI_PRIORITIES as unknown as string[]) priority?: RfiPriority;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty() @MaxLength(200) toParty?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() replyBy?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable() @IsUUID() documentId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable() @IsUUID() boqItemId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() costImpact?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() timeImpact?: boolean;
  @ApiPropertyOptional({ type: [String], description: 'The full list: files left out are detached' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

/** An answer received by letter, mail or at a meeting, recorded by staff. */
export class RecordAnswerDto {
  @ApiProperty({ example: 'Follow STR-GA-101 R2. The architectural section will be revised.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) answer: string;
  @ApiProperty({ example: '2026-10-24' }) @IsDateString() answeredOn: string;
  @ApiProperty({ example: 'Executive Engineer (by letter)' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) answeredByName: string;
  @ApiPropertyOptional({ example: 'EE/OWD/2026/1182', description: 'Their letter or mail reference' }) @IsOptional() @trim() @IsString() @MaxLength(100) answerRef?: string | null;
}

/** The client's engineer or consultant answering in their portal. */
export class PortalAnswerDto {
  @ApiProperty({ example: 'Agreed: follow the structural drawing.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) answer: string;
}

export class CloseRfiDto {
  @ApiProperty({ example: '2026-10-25' }) @IsDateString() on: string;
  @ApiPropertyOptional({ nullable: true, example: 'Footing cast at -1.50 m' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class WithdrawRfiDto {
  @ApiProperty({ example: 'Resolved at the site meeting' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export class LinkRfiDto {
  @ApiPropertyOptional({ nullable: true, description: 'A variation raised from the answer; null unlinks' }) @IsOptional() @nullable() @IsUUID() variationId?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'A delay or risk raised from the answer; null unlinks' }) @IsOptional() @nullable() @IsUUID() riskId?: string | null;
}

export class ListRfisQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: RFI_STATUSES }) @IsOptional() @IsIn(RFI_STATUSES as unknown as string[]) status?: RfiStatus;
  @ApiPropertyOptional({ description: 'Open and past the reply-by date' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ enum: RFI_PRIORITIES }) @IsOptional() @IsIn(RFI_PRIORITIES as unknown as string[]) priority?: RfiPriority;
  @ApiPropertyOptional() @IsOptional() @IsUUID() documentId?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.rfis, default: 'raisedOn' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.rfis as unknown as string[]) sortBy?: RfiSortField;
}

export class RfiSummaryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
