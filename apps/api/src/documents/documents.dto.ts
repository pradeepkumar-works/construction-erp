import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import {
  DOCUMENT_DISCIPLINES,
  DOCUMENT_KINDS,
  LETTER_DIRECTIONS,
  LIST_SORT_FIELDS,
  MARKUP_COLORS,
  MARKUP_KINDS,
  MARKUP_MAX_POINTS,
  MARKUP_NOTE_MAX,
  REVISION_STATUSES,
  TRANSMITTAL_PURPOSES,
  type DocumentDiscipline,
  type DocumentKind,
  type DocumentSortField,
  type LetterDirection,
  type LetterSortField,
  type MarkupColor,
  type MarkupKind,
  type RevisionStatus,
  type TransmittalPurpose,
  type TransmittalSortField,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);

/* ---------- documents and revisions ---------- */

export class CreateRevisionDto {
  @ApiProperty({ example: 'R1', description: 'As printed on the title block; unique per document' }) @trim() @IsString() @IsNotEmpty() @MaxLength(20) revision: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() issuedOn: string;
  @ApiProperty({ enum: REVISION_STATUSES }) @IsIn(REVISION_STATUSES as unknown as string[]) status: RevisionStatus;
  @ApiPropertyOptional({ example: 'Structural consultant' }) @IsOptional() @trim() @IsString() @MaxLength(200) receivedFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Uploaded files (PDF or images)' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

export class UpdateRevisionDto extends PartialType(CreateRevisionDto) {}

export class CreateDocumentDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'STR-GA-101', description: 'Unique within the project' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) docNo: string;
  @ApiProperty({ example: 'General arrangement, first floor slab' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional({ enum: DOCUMENT_KINDS, default: 'DRAWING' }) @IsOptional() @IsIn(DOCUMENT_KINDS as unknown as string[]) kind?: DocumentKind;
  @ApiPropertyOptional({ enum: DOCUMENT_DISCIPLINES, default: 'GENERAL' }) @IsOptional() @IsIn(DOCUMENT_DISCIPLINES as unknown as string[]) discipline?: DocumentDiscipline;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiPropertyOptional({ type: CreateRevisionDto, description: 'The first revision, with its files' }) @IsOptional() @ValidateNested() @Type(() => CreateRevisionDto) revision?: CreateRevisionDto;
}

export class UpdateDocumentDto extends PartialType(OmitType(CreateDocumentDto, ['projectId', 'revision'] as const)) {}

export class ListDocumentsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: DOCUMENT_KINDS }) @IsOptional() @IsIn(DOCUMENT_KINDS as unknown as string[]) kind?: DocumentKind;
  @ApiPropertyOptional({ enum: DOCUMENT_DISCIPLINES }) @IsOptional() @IsIn(DOCUMENT_DISCIPLINES as unknown as string[]) discipline?: DocumentDiscipline;
  @ApiPropertyOptional({ enum: REVISION_STATUSES, description: 'Status of the current revision' }) @IsOptional() @IsIn(REVISION_STATUSES as unknown as string[]) status?: RevisionStatus;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.documents, default: 'docNo' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.documents as unknown as string[]) sortBy?: DocumentSortField;
}

export class ProjectQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class SearchDocumentsQuery {
  @ApiProperty({ example: 'liquidated damages cap' }) @trim() @IsString() @IsNotEmpty() @MaxLength(300) q!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

export class SiteDocumentsQuery {
  @ApiProperty() @IsUUID() projectId: string;
}

/* ---------- transmittals ---------- */

export class TransmittalItemInputDto {
  @ApiProperty() @IsUUID() revisionId: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) copies?: number;
}

export class CreateTransmittalDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Executive Engineer, R&B Division' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) toParty: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) attention?: string | null;
  @ApiProperty({ enum: TRANSMITTAL_PURPOSES }) @IsIn(TRANSMITTAL_PURPOSES as unknown as string[]) purpose: TransmittalPurpose;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() sentOn: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) remarks?: string | null;
  @ApiProperty({ type: [TransmittalItemInputDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TransmittalItemInputDto) items: TransmittalItemInputDto[];
}

export class UpdateTransmittalDto extends PartialType(OmitType(CreateTransmittalDto, ['projectId'] as const)) {}

export class AcknowledgeTransmittalDto {
  @ApiProperty({ example: '2026-10-15' }) @IsDateString() acknowledgedOn: string;
  @ApiProperty({ example: 'R. Das, AE' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) acknowledgedBy: string;
}

export class ListTransmittalsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'Not yet acknowledged' }) @IsOptional() @QueryBool() @IsBoolean() unacknowledged?: boolean;
  @ApiPropertyOptional({ description: 'Transmittals that carried this document' }) @IsOptional() @IsUUID() documentId?: string;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.transmittals, default: 'sentOn' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.transmittals as unknown as string[]) sortBy?: TransmittalSortField;
}

/* ---------- letters ---------- */

export class CreateLetterDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: LETTER_DIRECTIONS, description: 'IN = received, OUT = sent; numbered IN- / OUT-<year>-0001' }) @IsIn(LETTER_DIRECTIONS as unknown as string[]) direction: LetterDirection;
  @ApiPropertyOptional({ example: 'EE/RB/2026/412', description: "The other side's reference" }) @IsOptional() @trim() @IsString() @MaxLength(100) theirRef?: string | null;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() letterDate: string;
  @ApiProperty({ example: 'Executive Engineer, R&B Division', description: 'Received from (IN) or addressed to (OUT)' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) party: string;
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(300) subject: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) summary?: string | null;
  @ApiPropertyOptional({ description: 'Received letters: when a reply is due' }) @IsOptional() @opt() @IsDateString() replyBy?: string | null;
  @ApiPropertyOptional({ description: 'The letter this one answers' }) @IsOptional() @opt() @IsUUID() inReplyToId?: string | null;
  @ApiPropertyOptional({ description: 'A delay in the risk register this letter is about (notice, EoT claim)' }) @IsOptional() @opt() @IsUUID() riskId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

export class UpdateLetterDto extends PartialType(OmitType(CreateLetterDto, ['projectId', 'direction'] as const)) {}

export class ListLettersQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: LETTER_DIRECTIONS }) @IsOptional() @IsIn(LETTER_DIRECTIONS as unknown as string[]) direction?: LetterDirection;
  @ApiPropertyOptional() @IsOptional() @IsUUID() riskId?: string;
  @ApiPropertyOptional({ description: 'Received, reply due and not sent' }) @IsOptional() @QueryBool() @IsBoolean() awaitingReply?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.letters, default: 'letterDate' }) @IsOptional() @IsIn(LIST_SORT_FIELDS.letters as unknown as string[]) sortBy?: LetterSortField;
}

/* ---------- drawing markup (item 109) ---------- */

export class CreateMarkupDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'The revision it is drawn on' }) @IsUUID() revisionId: string;
  @ApiProperty({ description: "One of that revision's files" }) @IsUUID() attachmentId: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(5000) page?: number;
  @ApiProperty({ enum: MARKUP_KINDS }) @IsIn(MARKUP_KINDS as unknown as string[]) kind: MarkupKind;
  @ApiProperty({ example: [[0.42, 0.31]], description: '[x, y] from 0 to 1 of the page: one for a pin or text, two corners or ends for a cloud, box or arrow, up to 1000 for freehand' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MARKUP_MAX_POINTS)
  points: [number, number][];
  @ApiPropertyOptional({ enum: MARKUP_COLORS, default: 'RED' }) @IsOptional() @IsIn(MARKUP_COLORS as unknown as string[]) color?: MarkupColor;
  @ApiPropertyOptional({ description: 'The comment (needed on a pin), or the words of a text mark' }) @IsOptional() @trim() @IsString() @MaxLength(MARKUP_NOTE_MAX) note?: string | null;
}

export class UpdateMarkupDto {
  @ApiPropertyOptional({ description: 'Moved or reshaped' }) @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MARKUP_MAX_POINTS) points?: [number, number][];
  @ApiPropertyOptional({ enum: MARKUP_COLORS }) @IsOptional() @IsIn(MARKUP_COLORS as unknown as string[]) color?: MarkupColor;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(MARKUP_NOTE_MAX) note?: string | null;
}

export class ResolveMarkupDto {
  @ApiPropertyOptional({ example: 'Shown correctly on Rev R2' }) @IsOptional() @trim() @IsString() @MaxLength(MARKUP_NOTE_MAX) note?: string | null;
}

export class LinkMarkupRfiDto {
  @ApiPropertyOptional({ nullable: true, description: 'The RFI raised from this mark; null removes the link' }) @IsOptional() @IsUUID() rfiId: string | null;
}
