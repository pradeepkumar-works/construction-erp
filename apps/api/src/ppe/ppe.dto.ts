import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { PPE_ISSUE_STATUSES, PPE_KINDS, type PpeIssueStatus, type PpeKind } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const KINDS = PPE_KINDS as unknown as string[];

export class IssuePpeDto {
  @ApiPropertyOptional({ ...CLIENT_ID_DOC, description: "The phone's id for this batch; a retried send issues nothing twice" }) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ type: [String], description: 'Workers who receive the kit' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(300) @ArrayUnique() @IsUUID('all', { each: true }) workerIds: string[];
  @ApiProperty({ enum: PPE_KINDS, isArray: true, description: 'Kinds each of them receives' }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(PPE_KINDS.length) @ArrayUnique() @IsIn(KINDS, { each: true }) kinds: PpeKind[];
  @ApiProperty({ example: '2026-10-19' }) @IsDateString() issuedOn: string;
  @ApiPropertyOptional({ example: '9', description: 'Shoe size, jacket size…; when one size suits the whole batch' }) @IsOptional() @trim() @IsString() @MaxLength(20) size?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) note?: string | null;
}

export class ClosePpeDto {
  @ApiProperty({ enum: ['RETURNED', 'LOST'] }) @IsIn(['RETURNED', 'LOST']) status: 'RETURNED' | 'LOST';
  @ApiProperty({ example: '2026-10-19' }) @IsDateString() on: string;
  @ApiPropertyOptional({ description: 'Recover its cost from the labour contractor; true by default when lost' }) @IsOptional() @IsBoolean() recoverable?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @trim() @IsString() @MaxLength(500) note?: string | null;
}

export class SetPpeRequiredDto {
  @ApiProperty({ enum: PPE_KINDS, isArray: true, description: 'Kit every worker at the project must have (may be empty)' }) @IsArray() @ArrayMaxSize(PPE_KINDS.length) @ArrayUnique() @IsIn(KINDS, { each: true }) kinds: PpeKind[];
}

export class ListPpeQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workerId?: string;
  @ApiPropertyOptional({ enum: PPE_ISSUE_STATUSES }) @IsOptional() @IsIn(PPE_ISSUE_STATUSES as unknown as string[]) status?: PpeIssueStatus;
  @ApiPropertyOptional({ enum: PPE_KINDS }) @IsOptional() @IsIn(KINDS) kind?: PpeKind;
  @ApiPropertyOptional({ description: 'Only open issues past their replace-by date' }) @IsOptional() @QueryBool() due?: boolean;
  @ApiPropertyOptional({ description: 'Only items to recover from the contractor' }) @IsOptional() @QueryBool() recoverable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}
