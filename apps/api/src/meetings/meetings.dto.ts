import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { MEETING_ACTION_STATUSES, MEETING_KINDS, MEETING_LINK_KINDS, MEETING_POINT_KINDS, type MeetingActionStatus, type MeetingKind, type MeetingLinkKind, type MeetingPointKind } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class MeetingQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'all (the default), draft or issued' }) @IsOptional() @IsIn(['all', 'draft', 'issued']) status?: 'all' | 'draft' | 'issued';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class MeetingActionQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'open (the default), overdue, done or all' }) @IsOptional() @IsIn(['open', 'overdue', 'done', 'all']) status?: 'open' | 'overdue' | 'done' | 'all';
  @ApiPropertyOptional({ description: "Only the caller's own actions" }) @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean() mine?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class AttendeeInput {
  @ApiPropertyOptional({ description: 'One of our users; their name and email come from them' }) @IsOptional() @nullable() @IsUUID() userId?: string | null;
  @ApiPropertyOptional({ example: 'S. K. Rath' }) @IsOptional() @trim() @IsString() @MaxLength(120) name?: string | null;
  @ApiPropertyOptional({ example: 'Client: Health & Family Welfare' }) @IsOptional() @trim() @IsString() @MaxLength(120) organisation?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @nullable() @IsEmail({}, { message: 'Enter a valid email, like name@company.com' }) @MaxLength(160) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() present?: boolean;
}

export class PointInput {
  @ApiProperty({ enum: MEETING_POINT_KINDS }) @IsIn(MEETING_POINT_KINDS as unknown as string[]) kind: MeetingPointKind;
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Write the point' }) @MaxLength(2000) text: string;
}

export class ActionInput {
  @ApiPropertyOptional({ description: 'An action already on the meeting, to keep its status' }) @IsOptional() @IsUUID() id?: string;
  @ApiProperty({ example: 'Send the revised staircase drawing' }) @trim() @IsString() @IsNotEmpty({ message: 'Say what is to be done' }) @MaxLength(1000) text: string;
  @ApiPropertyOptional({ description: 'One of our users, who then sees it in My work' }) @IsOptional() @nullable() @IsUUID() ownerUserId?: string | null;
  @ApiPropertyOptional({ description: 'Someone from outside, by name, when not one of our users' }) @IsOptional() @trim() @IsString() @MaxLength(120) ownerName?: string | null;
  @ApiPropertyOptional({ example: '2026-11-15' }) @IsOptional() @nullable() @IsDateString({}, { message: 'Choose the date it is due' }) dueOn?: string | null;
  @ApiPropertyOptional({ enum: MEETING_LINK_KINDS }) @IsOptional() @nullable() @IsIn(MEETING_LINK_KINDS as unknown as string[]) linkKind?: MeetingLinkKind | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsUUID() linkId?: string | null;
}

class MeetingFields {
  @ApiPropertyOptional({ enum: MEETING_KINDS }) @IsOptional() @IsIn(MEETING_KINDS as unknown as string[]) kind?: MeetingKind;
  @ApiPropertyOptional({ example: '10:30' }) @IsOptional() @trim() @nullable() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Enter the time as HH:MM' }) startTime?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) venue?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(120) chairedBy?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) agenda?: string | null;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsDateString() nextOn?: string | null;
  @ApiPropertyOptional({ type: [AttendeeInput] }) @IsOptional() @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => AttendeeInput) attendees?: AttendeeInput[];
  @ApiPropertyOptional({ type: [PointInput] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PointInput) points?: PointInput[];
  @ApiPropertyOptional({ type: [ActionInput] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ActionInput) actions?: ActionInput[];
}

export class CreateMeetingDto extends MeetingFields {
  @ApiProperty() @IsUUID('4', { message: 'Choose the project' }) projectId: string;
  @ApiProperty({ example: 'Weekly progress review' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the meeting' }) @MaxLength(200) title: string;
  @ApiProperty({ example: '2026-11-04' }) @IsDateString({}, { message: 'Choose the day it was held' }) heldOn: string;
}

export class UpdateMeetingDto extends MeetingFields {
  @ApiPropertyOptional({ example: 'Weekly progress review' }) @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the meeting' }) @MaxLength(200) title?: string;
  @ApiPropertyOptional({ example: '2026-11-04' }) @IsOptional() @IsDateString({}, { message: 'Choose the day it was held' }) heldOn?: string;
}

export class UpdateActionDto {
  @ApiPropertyOptional({ enum: MEETING_ACTION_STATUSES }) @IsOptional() @IsIn(MEETING_ACTION_STATUSES as unknown as string[]) status?: MeetingActionStatus;
  @ApiPropertyOptional({ description: 'The day it was done' }) @IsOptional() @nullable() @IsDateString() doneOn?: string | null;
  @ApiPropertyOptional({ description: 'How it was closed, or why dropped' }) @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional({ description: 'A new due date, while open' }) @IsOptional() @nullable() @IsDateString() dueOn?: string | null;
}
