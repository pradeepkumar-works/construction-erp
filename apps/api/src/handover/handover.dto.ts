import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { CLOSEOUT_CATEGORIES, DEFECT_PHASES, DEFECT_PRIORITIES, DEFECT_STATUSES, type CloseoutCategory, type DefectPhase, type DefectPriority, type DefectStatus } from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const dateOnly = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a YYYY-MM-DD date' });
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const num = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value));
const int = () => Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));
/** null clears an optional field on PATCH; undefined leaves it. */
const nullable = () => ValidateIf((_, v) => v !== null);
const files = () => [IsOptional(), IsArray(), ArrayMaxSize(10), IsUUID('all', { each: true })];
const Files = (): PropertyDecorator => (target, key) => files().forEach((d) => d(target, key));

export class SaveHandoverDto {
  @ApiProperty({ example: '2026-09-30', description: 'Date of completion the certificate states; the defect liability period runs from it' })
  @IsDateString()
  @dateOnly()
  completedOn: string;
  @ApiPropertyOptional({ example: 'CC/RB/2026/114' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(80) certificateNo?: string | null;
  @ApiPropertyOptional({ example: '2026-10-08' }) @IsOptional() @nullable() @IsDateString() @dateOnly() certificateDate?: string | null;
  @ApiPropertyOptional({ example: 'Executive Engineer, R&B Division, Cuttack' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(160) certifiedBy?: string | null;
  @ApiPropertyOptional({ example: 12, description: "The contract's defect liability period when omitted (12 months if it has none)" })
  @IsOptional()
  @int()
  @IsInt()
  @Min(0)
  @Max(120)
  dlpMonths?: number;
  @ApiPropertyOptional() @IsOptional() @nullable() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Scan of the certificate; the complete set' }) @Files() attachmentIds?: string[];
}

export class CreateCloseoutItemDto {
  @ApiProperty({ enum: CLOSEOUT_CATEGORIES }) @IsIn(CLOSEOUT_CATEGORIES) category: CloseoutCategory;
  @ApiProperty({ example: 'Borrow pits levelled and handed back' }) @trim() @IsString() @MinLength(1) @MaxLength(200) title: string;
}

export class UpdateCloseoutItemDto {
  @ApiPropertyOptional({ enum: CLOSEOUT_CATEGORIES }) @IsOptional() @IsIn(CLOSEOUT_CATEGORIES) category?: CloseoutCategory;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ description: 'Tick or untick it' }) @IsOptional() @IsBoolean() done?: boolean;
  @ApiPropertyOptional({ example: '2026-10-12', description: 'When it was done (today when ticked without one)' }) @IsOptional() @IsDateString() @dateOnly() doneOn?: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class ListDefectsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: DEFECT_PHASES }) @IsOptional() @IsIn(DEFECT_PHASES) phase?: DefectPhase;
  @ApiPropertyOptional({ enum: [...DEFECT_STATUSES, 'PENDING'], description: 'PENDING = open or fixed (not yet accepted)' })
  @IsOptional()
  @IsIn([...DEFECT_STATUSES, 'PENDING'])
  status?: DefectStatus | 'PENDING';
  @ApiPropertyOptional({ description: 'Only open ones past their due date' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ description: 'Only the ones assigned to me' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
}

class DefectFields {
  @ApiPropertyOptional({ example: 'Hairline cracks in the parapet plaster' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ example: 'Block B, 3rd floor, flat 302' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional({ example: 'Plaster' }) @IsOptional() @nullable() @trim() @IsString() @MaxLength(80) trade?: string | null;
  @ApiPropertyOptional({ enum: DEFECT_PRIORITIES }) @IsOptional() @IsIn(DEFECT_PRIORITIES) priority?: DefectPriority;
  @ApiPropertyOptional({ example: "Er. S. Das (client's AE)", description: 'Who found it, when not one of us' })
  @IsOptional()
  @nullable()
  @trim()
  @IsString()
  @MaxLength(120)
  reportedByName?: string | null;
  @ApiPropertyOptional({ description: 'Our person who is to put it right' }) @IsOptional() @nullable() @IsUUID() assignedToId?: string | null;
  @ApiPropertyOptional({ example: 'Maa Tarini Plastering Works', description: 'Subcontractor who is to put it right' })
  @IsOptional()
  @nullable()
  @trim()
  @IsString()
  @MaxLength(160)
  contractor?: string | null;
  @ApiPropertyOptional({ example: '2026-10-25' }) @IsOptional() @nullable() @IsDateString() @dateOnly() dueDate?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Photos; on PATCH the complete set' }) @Files() attachmentIds?: string[];
}

export class CreateDefectDto extends DefectFields {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiPropertyOptional({ enum: DEFECT_PHASES, description: 'A defect once completion is recorded, a snag before, when omitted' })
  @IsOptional()
  @IsIn(DEFECT_PHASES)
  phase?: DefectPhase;
  @ApiProperty({ example: 'Parapet plaster cracked' }) @trim() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiPropertyOptional({ example: '2026-10-14', description: 'Today when omitted' }) @IsOptional() @IsDateString() @dateOnly() reportedOn?: string;
}

export class UpdateDefectDto extends DefectFields {
  @ApiPropertyOptional({ enum: DEFECT_PHASES }) @IsOptional() @IsIn(DEFECT_PHASES) phase?: DefectPhase;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ example: '2026-10-14' }) @IsOptional() @IsDateString() @dateOnly() reportedOn?: string;
}

export class FixDefectDto {
  @ApiPropertyOptional({ example: '2026-10-20', description: 'Today when omitted' }) @IsOptional() @IsDateString() @dateOnly() fixedOn?: string;
  @ApiPropertyOptional({ example: 'Cracks cut open, filled with polymer mortar and re-plastered' }) @IsOptional() @trim() @IsString() @MaxLength(2000) fixNote?: string;
  @ApiPropertyOptional({ example: '4500', description: 'What putting it right cost' }) @IsOptional() @nullable() @num() @IsNumberString() cost?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Photos after the repair, added to the ones already there' }) @Files() attachmentIds?: string[];
}

export class DefectNoteDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string;
}
