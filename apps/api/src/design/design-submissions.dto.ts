import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { DESIGN_CODES, DESIGN_PURPOSES, DESIGN_SUBMISSION_KINDS, DESIGN_SUBMISSION_STATUSES, DRAWING_SOURCES, type DesignCode, type DesignPurpose, type DesignSubmissionKind, type DesignSubmissionStatus, type DrawingSource } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blank = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const list = (xs: readonly string[]) => xs as unknown as string[];

export class SaveDesignSubmissionDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: 'Superstructure drawings, first and second floor slabs' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional({ enum: DESIGN_SUBMISSION_KINDS, default: 'DRAWINGS' }) @IsOptional() @IsIn(list(DESIGN_SUBMISSION_KINDS)) kind?: DesignSubmissionKind;
  @ApiPropertyOptional({ enum: DESIGN_PURPOSES, default: 'APPROVAL' }) @IsOptional() @IsIn(list(DESIGN_PURPOSES)) purpose?: DesignPurpose;
  @ApiProperty({ example: 'The Executive Engineer, Building Division No. 1', description: 'Addressed to, as written' }) @trim() @IsString() @IsNotEmpty() @MaxLength(300) toParty: string;
  @ApiPropertyOptional({ enum: DRAWING_SOURCES, default: 'CLIENT', description: "The reviewer's side" }) @IsOptional() @IsIn(list(DRAWING_SOURCES)) source?: DrawingSource;
  @ApiProperty({ type: [String], description: 'Documents of the register it sends' }) @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) documentIds: string[];
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ example: '45000.00', description: "Vetting: the institution's fee" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() fee?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class SubmitDesignDto {
  @ApiProperty({ example: '2026-11-02' }) @IsDateString() submittedOn: string;
  @ApiPropertyOptional({ description: 'Asked to reply by; the usual period from the day it goes when left out' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() replyBy?: string | null;
  @ApiPropertyOptional({ description: 'What changed since the last round, or the covering note' }) @IsOptional() @blank() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ description: 'Draft a covering letter in Correspondence' }) @IsOptional() @IsBoolean() letter?: boolean;
}

export class DesignCommentLineDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(2000) text: string;
  @ApiPropertyOptional({ description: 'The drawing it is on' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() documentId?: string | null;
}

export class RecordDesignCodeDto {
  @ApiProperty({ enum: DESIGN_CODES }) @IsIn(list(DESIGN_CODES)) code: DesignCode;
  @ApiProperty({ example: '2026-11-12' }) @IsDateString() reviewedOn: string;
  @ApiPropertyOptional({ description: 'Who reviewed, as written' }) @IsOptional() @blank() @IsString() @MaxLength(200) reviewerName?: string | null;
  @ApiPropertyOptional({ description: 'Their letter or mail reference' }) @IsOptional() @blank() @IsString() @MaxLength(120) reviewRef?: string | null;
  @ApiPropertyOptional({ description: 'Vetting: the certificate number, with an A or B' }) @IsOptional() @blank() @IsString() @MaxLength(120) certificateNo?: string | null;
  @ApiProperty({ type: [DesignCommentLineDto] }) @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => DesignCommentLineDto) comments: DesignCommentLineDto[];
}

export class ReplyCommentDto {
  @ApiProperty({ example: 'Lap length revised to 50d at the column junctions; see STR-210 R2.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) reply: string;
}

export class WithdrawDesignDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export const DESIGN_LIST_FILTERS = [...DESIGN_SUBMISSION_STATUSES, 'LATE', 'WITH_US'] as const;
export type DesignListFilter = DesignSubmissionStatus | 'LATE' | 'WITH_US';

export class DesignSubmissionsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: DESIGN_LIST_FILTERS, description: 'LATE: under review past its reply-by date; WITH_US: sent back (C or D)' }) @IsOptional() @IsIn(list(DESIGN_LIST_FILTERS)) status?: DesignListFilter;
  @ApiPropertyOptional({ enum: DESIGN_PURPOSES }) @IsOptional() @IsIn(list(DESIGN_PURPOSES)) purpose?: DesignPurpose;
  @ApiPropertyOptional({ enum: DESIGN_SUBMISSION_KINDS }) @IsOptional() @IsIn(list(DESIGN_SUBMISSION_KINDS)) kind?: DesignSubmissionKind;
  @ApiPropertyOptional({ description: 'Only those with comments still to answer' }) @IsOptional() @QueryBool() @IsBoolean() toAnswer?: boolean;
}
