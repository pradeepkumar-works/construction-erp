import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import {
  DOCUMENT_DISCIPLINES,
  DOCUMENT_KINDS,
  LIST_SORT_FIELDS,
  MARKUP_COLORS,
  MARKUP_KINDS,
  MARKUP_MAX_POINTS,
  MARKUP_NOTE_MAX,
  TAKEOFF_KINDS,
  TAKEOFF_LABEL_MAX,
  TAKEOFF_MAX_POINTS,
  SCALE_MAX_M,
  SCALE_MIN_M,
  REVISION_STATUSES,
  TRANSMITTAL_PURPOSES,
  type DocumentDiscipline,
  type DocumentKind,
  type DocumentSortField,
  type MarkupColor,
  type MarkupKind,
  type RevisionStatus,
  TAKEOFF_BOQ_FIELDS,
  type TakeoffBoqField,
  type TakeoffKind,
  type TransmittalPurpose,
  type TransmittalSortField,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);

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

export class SetDrawingScaleDto {
  @ApiProperty({ description: "One of the document's revision files" }) @IsUUID() attachmentId: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(5000) page?: number;
  @ApiProperty({ example: [[0.1, 0.5], [0.6, 0.5]], description: 'Two points [x, y] from 0 to 1 of the page, a known distance apart' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  points: [number, number][];
  @ApiProperty({ example: 12.5, description: 'The real distance between them, in metres' }) @Type(() => Number) @Min(SCALE_MIN_M) @Max(SCALE_MAX_M) lengthM: number;
  @ApiProperty({ example: 1.414, description: "The page's width over its height" }) @Type(() => Number) @Min(0.01) @Max(100) aspect: number;
}

export class CreateTakeoffDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty({ description: 'The revision it is measured on' }) @IsUUID() revisionId: string;
  @ApiProperty({ description: "One of that revision's files" }) @IsUUID() attachmentId: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Max(5000) page?: number;
  @ApiProperty({ enum: TAKEOFF_KINDS }) @IsIn(TAKEOFF_KINDS as unknown as string[]) kind: TakeoffKind;
  @ApiProperty({ example: [[0.1, 0.2], [0.5, 0.2]], description: '[x, y] from 0 to 1 of the page: the points along a length, the corners of an area, or each thing counted' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TAKEOFF_MAX_POINTS)
  points: [number, number][];
  @ApiProperty({ example: 'Plinth beam, grid A' }) @trim() @IsString() @MaxLength(TAKEOFF_LABEL_MAX) label: string;
}

export class UpdateTakeoffDto {
  @ApiProperty() @trim() @IsString() @MaxLength(TAKEOFF_LABEL_MAX) label: string;
}

export class TakeoffsToBoqDto {
  @ApiProperty({ type: [String], description: 'The measures to add up, all of one kind' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(TAKEOFF_MAX_POINTS) @IsUUID('all', { each: true }) ids: string[];
  @ApiProperty({ description: "A BOQ item of the document's project" }) @IsUUID() boqItemId: string;
  @ApiProperty({ enum: TAKEOFF_BOQ_FIELDS, description: 'The original (tender) quantity or the revised one' }) @IsIn(TAKEOFF_BOQ_FIELDS as unknown as string[]) field: TakeoffBoqField;
  @ApiPropertyOptional({ example: 0.15, default: 1, description: "Multiplies the total, e.g. a slab's thickness in metres" }) @IsOptional() @Type(() => Number) @Min(0.001) @Max(100000) factor?: number;
}

export class TakeoffsToMeasurementDto {
  @ApiProperty({ type: [String], description: 'The measures put in the sheet' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(TAKEOFF_MAX_POINTS) @IsUUID('all', { each: true }) ids: string[];
  @ApiProperty({ description: 'The measurement sheet they went into' }) @IsUUID() measurementId: string;
}
