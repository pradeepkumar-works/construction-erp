import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { COPY_DISPOSALS, type CopyDisposal, type CopyState } from '@erp/shared';
import { PageQuery } from '../common/paging';

const blank = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const list = (xs: readonly string[]) => xs as unknown as string[];
const COPY_STATE_FILTERS = ['IN_FORCE', 'TO_RECALL', 'CLOSED', 'LATE'] as const;
export type CopyStateFilter = CopyState | 'LATE';

export class IssueCopiesDto {
  @ApiProperty() @IsUUID() documentId: string;
  @ApiProperty({ type: [String], example: ['Site office', 'Formwork subcontractor'], description: 'One copy each, numbered; a holder who had a copy keeps its number' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  holders: string[];
  @ApiProperty({ example: '2026-11-02' }) @IsDateString() issuedOn: string;
  @ApiPropertyOptional({ description: 'The transmittal the prints went out on' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() transmittalId?: string | null;
}

export class DisposeCopyDto {
  @ApiProperty({ example: '2026-11-04' }) @IsDateString() disposedOn: string;
  @ApiProperty({ enum: COPY_DISPOSALS }) @IsIn(list(COPY_DISPOSALS)) disposal: CopyDisposal;
  @ApiPropertyOptional() @IsOptional() @blank() @IsString() @MaxLength(500) note?: string | null;
}

export class ReissueCopyDto {
  @ApiProperty({ example: '2026-11-02' }) @IsDateString() issuedOn: string;
}

export class CopiesQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() documentId?: string;
  @ApiPropertyOptional({ enum: COPY_STATE_FILTERS, description: 'LATE: superseded and out longer than the recall period' }) @IsOptional() @IsIn(list(COPY_STATE_FILTERS)) state?: CopyStateFilter;
}

export class DesignDashboardQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}

