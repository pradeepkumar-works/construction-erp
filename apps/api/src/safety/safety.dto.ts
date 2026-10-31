import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import {
  SAFETY_INCIDENT_STATUSES,
  SAFETY_INCIDENT_TYPES,
  WORK_PERMIT_STATUSES,
  WORK_PERMIT_TYPES,
  type SafetyIncidentStatus,
  type SafetyIncidentType,
  type WorkPermitStatus,
  type WorkPermitType,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';
import { CLIENT_ID_DOC } from '../common/idempotency';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const int = () => Transform(({ value }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value));
const nullable = () => ValidateIf((_, v) => v !== null);

export class CreateIncidentDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: SAFETY_INCIDENT_TYPES }) @IsIn(SAFETY_INCIDENT_TYPES as unknown as string[]) type: SafetyIncidentType;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
  @ApiPropertyOptional({ example: '15:40', description: 'Time of day, 24-hour' }) @IsOptional() @nullable() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:mm' }) time?: string | null;
  @ApiProperty({ example: 'Block A, 2nd floor slab edge' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) location: string;
  @ApiProperty({ example: 'Helper slipped on shuttering oil near the slab edge; caught by the guard rail.' }) @trim() @IsString() @IsNotEmpty() @MaxLength(4000) description: string;
  @ApiPropertyOptional({ description: 'People hurt' }) @IsOptional() @int() @IsInt() @Min(0) @Max(500) injuredCount?: number;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) injuredNames?: string | null;
  @ApiPropertyOptional({ description: 'Whose workers were involved' }) @IsOptional() @trim() @IsString() @MaxLength(200) contractor?: string | null;
  @ApiPropertyOptional({ description: 'What was done at once (first aid, area cordoned off)' }) @IsOptional() @trim() @IsString() @MaxLength(2000) immediateAction?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) rootCause?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) correctiveAction?: string | null;
  @ApiPropertyOptional({ description: 'Lost time injury: days off work' }) @IsOptional() @int() @nullable() @IsInt() @Min(0) @Max(3650) daysLost?: number | null;
  @ApiPropertyOptional({ type: [String], description: 'Photos of the spot' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateIncidentDto extends PartialType(OmitType(CreateIncidentDto, ['id', 'projectId'] as const)) {}

export class CloseIncidentDto {
  @ApiPropertyOptional({ description: 'Required unless already recorded' }) @IsOptional() @trim() @IsString() @MaxLength(2000) rootCause?: string;
  @ApiPropertyOptional({ description: 'Required unless already recorded' }) @IsOptional() @trim() @IsString() @MaxLength(2000) correctiveAction?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) closureNote?: string | null;
}

/** `q` matches the number, location, description, contractor and project name. */
export class ListIncidentsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SAFETY_INCIDENT_TYPES }) @IsOptional() @IsIn(SAFETY_INCIDENT_TYPES as unknown as string[]) type?: SafetyIncidentType;
  @ApiPropertyOptional({ description: 'Leave out near misses' }) @IsOptional() @QueryBool() @IsBoolean() incidentsOnly?: boolean;
  @ApiPropertyOptional({ enum: SAFETY_INCIDENT_STATUSES }) @IsOptional() @IsIn(SAFETY_INCIDENT_STATUSES as unknown as string[]) status?: SafetyIncidentStatus;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateTalkDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-14' }) @IsDateString() date: string;
  @ApiProperty({ example: 'Working at height and harness use' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) topic: string;
  @ApiProperty({ example: 'Ramesh (safety steward)' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) conductedBy: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) contractor?: string | null;
  @ApiProperty({ minimum: 1 }) @int() @IsInt() @Min(1) @Max(2000) attendeeCount: number;
  @ApiPropertyOptional({ description: 'Names, or leave out and attach the signed sheet' }) @IsOptional() @trim() @IsString() @MaxLength(4000) attendees?: string | null;
  @ApiPropertyOptional() @IsOptional() @int() @nullable() @IsInt() @Min(1) @Max(480) durationMinutes?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) notes?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Photo of the talk or the signed attendance sheet' }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdateTalkDto extends PartialType(OmitType(CreateTalkDto, ['id', 'projectId'] as const)) {}

/** `q` matches the number, topic, who gave it, contractor and project name. */
export class ListTalksQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class TalkTodayQuery {
  @ApiProperty() @IsUUID() projectId: string;
}

export class CreatePermitDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ enum: WORK_PERMIT_TYPES }) @IsIn(WORK_PERMIT_TYPES as unknown as string[]) type: WorkPermitType;
  @ApiProperty({ example: 'Overhead tank, terrace' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) location: string;
  @ApiProperty({ example: 'Welding the tank stand brackets' }) @trim() @IsString() @IsNotEmpty() @MaxLength(2000) description: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) contractor?: string | null;
  @ApiPropertyOptional() @IsOptional() @int() @nullable() @IsInt() @Min(1) @Max(500) workerCount?: number | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(2000) workers?: string | null;
  @ApiProperty({ example: '2026-10-15T09:00:00+05:30' }) @IsISO8601() validFrom: string;
  @ApiProperty({ example: '2026-10-15T18:00:00+05:30', description: 'At most 7 days after validFrom' }) @IsISO8601() validTo: string;
  @ApiPropertyOptional({ type: [String], description: 'Precautions in place (from PERMIT_PRECAUTIONS or typed)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  precautions?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class UpdatePermitDto extends PartialType(OmitType(CreatePermitDto, ['id', 'projectId'] as const)) {}

export class IssuePermitDto {
  @ApiPropertyOptional({ description: 'Conditions on the permit' }) @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Precautions as checked at issue (replaces the requested list)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  precautions?: string[];
}

export class RejectPermitDto {
  @ApiProperty({ description: 'Why' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export class ClosePermitDto {
  @ApiPropertyOptional({ description: 'Work done, area made safe' }) @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

/** `q` matches the number, location, work, contractor and project name. */
export class ListPermitsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: WORK_PERMIT_TYPES }) @IsOptional() @IsIn(WORK_PERMIT_TYPES as unknown as string[]) type?: WorkPermitType;
  @ApiPropertyOptional({ enum: WORK_PERMIT_STATUSES }) @IsOptional() @IsIn(WORK_PERMIT_STATUSES as unknown as string[]) status?: WorkPermitStatus;
  @ApiPropertyOptional({ description: 'Requested and issued permits (what is live at site)' }) @IsOptional() @QueryBool() @IsBoolean() active?: boolean;
}

export class SafetySummaryQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
}
