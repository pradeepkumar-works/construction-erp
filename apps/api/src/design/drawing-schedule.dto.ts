import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { DOCUMENT_DISCIPLINES, DRAWING_SOURCES, type DocumentDiscipline, type DrawingNeedState, type DrawingSource } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const blank = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const list = (xs: readonly string[]) => xs as unknown as string[];

export class DrawingNeedLineDto {
  @ApiPropertyOptional({ example: 'HSP-STR-012', description: 'The number it will carry, when known' }) @IsOptional() @blank() @IsString() @MaxLength(80) docNo?: string | null;
  @ApiProperty({ example: 'Second floor slab reinforcement' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) title: string;
  @ApiPropertyOptional({ enum: DOCUMENT_DISCIPLINES }) @IsOptional() @IsIn(list(DOCUMENT_DISCIPLINES)) discipline?: DocumentDiscipline;
  @ApiPropertyOptional({ enum: DRAWING_SOURCES, default: 'CLIENT' }) @IsOptional() @IsIn(list(DRAWING_SOURCES)) source?: DrawingSource;
  @ApiPropertyOptional({ example: 'The Executive Engineer, Building Division No. 1', description: 'Who issues it, as a letter is addressed' }) @IsOptional() @blank() @IsString() @MaxLength(300) fromParty?: string | null;
  @ApiProperty({ example: '2026-11-15', description: 'The day site needs it good for construction' }) @IsDateString() neededBy: string;
  @ApiPropertyOptional({ description: 'The work it holds up' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() activityId?: string | null;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(1000) remarks?: string | null;
}

export class SaveDrawingNeedDto extends DrawingNeedLineDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ description: 'No longer needed' }) @IsOptional() @IsBoolean() dropped?: boolean;
  @ApiPropertyOptional({ description: "The register's document, when its number differs from the schedule's" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() documentId?: string | null;
}

export class AddDrawingNeedsDto {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ type: [DrawingNeedLineDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => DrawingNeedLineDto) lines: DrawingNeedLineDto[];
}

export const NEED_FILTERS = ['AWAITED', 'RECEIVED', 'GFC', 'DROPPED', 'LATE', 'SOON'] as const;
export type NeedFilter = DrawingNeedState | 'LATE' | 'SOON';

export class DrawingScheduleQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: NEED_FILTERS, description: 'LATE: still not buildable past its day; SOON: needed within a week' }) @IsOptional() @IsIn(list(NEED_FILTERS)) state?: NeedFilter;
  @ApiPropertyOptional({ enum: DOCUMENT_DISCIPLINES }) @IsOptional() @IsIn(list(DOCUMENT_DISCIPLINES)) discipline?: DocumentDiscipline;
  @ApiPropertyOptional({ enum: DRAWING_SOURCES }) @IsOptional() @IsIn(list(DRAWING_SOURCES)) source?: DrawingSource;
  @ApiPropertyOptional({ description: 'Only the client side’s drawings' }) @IsOptional() @QueryBool() @IsBoolean() clientSide?: boolean;
}

export class NextDrawingNoQuery {
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: DOCUMENT_DISCIPLINES }) @IsIn(list(DOCUMENT_DISCIPLINES)) discipline: DocumentDiscipline;
}

export class AsBuiltQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
