import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import {
  LETTER_ACTIONS,
  LETTER_APPROVAL_RULES,
  LETTER_DIRECTIONS,
  LETTER_MODES,
  LETTER_PRIORITIES,
  LETTER_STATUSES,
  LIST_SORT_FIELDS,
  type LetterAction,
  type LetterApprovalRule,
  type LetterDirection,
  type LetterMode,
  type LetterPriority,
  type LetterSortField,
  type LetterStatus,
} from '@erp/shared';
import { PageQuery, QueryBool } from '../common/paging';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const opt = () => ValidateIf((_, v) => v !== null && v !== undefined);
const list = (xs: readonly string[]) => xs as unknown as string[];

/* ---------- letters ---------- */

export class CreateLetterDto {
  @ApiPropertyOptional({ description: 'The project; leave out (or null) for a head office letter' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiProperty({ enum: LETTER_DIRECTIONS, description: 'IN = received (numbered at once), OUT = sent (numbered when approved, or at once where it needs no approval)' })
  @IsIn(list(LETTER_DIRECTIONS))
  direction: LetterDirection;
  @ApiPropertyOptional({ example: 'EE/RD2/2026/412', description: "The other side's reference" }) @IsOptional() @trim() @IsString() @MaxLength(100) theirRef?: string | null;
  @ApiProperty({ example: '2026-10-14', description: "The letter's own date: theirs for one received; ours for one sent (the day it is issued)" }) @IsDateString() letterDate: string;
  @ApiPropertyOptional({ example: '2026-10-16', description: 'Received letters: the day it reached us (today if left out)' }) @IsOptional() @opt() @IsDateString() receivedOn?: string | null;
  @ApiProperty({ example: 'The Executive Engineer, Road Division No. 2', description: 'Received from (IN) or addressed to (OUT)' }) @trim() @IsString() @IsNotEmpty() @MaxLength(300) party: string;
  @ApiPropertyOptional({ description: 'The address book entry behind `party`' }) @IsOptional() @opt() @IsUUID() contactId?: string | null;
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(300) subject: string;
  @ApiPropertyOptional({ description: 'The gist' }) @IsOptional() @trim() @IsString() @MaxLength(4000) summary?: string | null;
  @ApiPropertyOptional({ description: "Sent letters: the text, printed on the company's letterhead" }) @IsOptional() @IsString() @MaxLength(20000) body?: string | null;
  @ApiPropertyOptional({ example: 'notice', description: 'A letter category (master) code' }) @IsOptional() @opt() @IsString() @MaxLength(60) category?: string | null;
  @ApiPropertyOptional({ enum: LETTER_PRIORITIES }) @IsOptional() @IsIn(list(LETTER_PRIORITIES)) priority?: LetterPriority;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confidential?: boolean;
  @ApiPropertyOptional({ enum: LETTER_MODES, description: 'How it came (IN) or how it is sent (OUT)' }) @IsOptional() @opt() @IsIn(list(LETTER_MODES)) mode?: LetterMode | null;
  @ApiPropertyOptional({ description: 'When a reply is due: ours to a letter received, theirs to one sent' }) @IsOptional() @opt() @IsDateString() replyBy?: string | null;
  @ApiPropertyOptional({ description: 'The letter this one answers' }) @IsOptional() @opt() @IsUUID() inReplyToId?: string | null;
  @ApiPropertyOptional({ description: 'A delay in the risk register this letter is about (notice, EoT claim)' }) @IsOptional() @opt() @IsUUID() riskId?: string | null;
  @ApiPropertyOptional({ description: 'Sent letters: who signs it (and approves it where approval is needed)' }) @IsOptional() @opt() @IsUUID() signatoryId?: string | null;
  @ApiPropertyOptional({ description: 'Received letters: mark it to someone at once' }) @IsOptional() @opt() @IsUUID() markToId?: string | null;
  @ApiPropertyOptional({ enum: LETTER_ACTIONS }) @IsOptional() @opt() @IsIn(list(LETTER_ACTIONS)) action?: LetterAction | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() actionDue?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ description: 'Sent letters: one already signed and sent outside Nirmaan, numbered at once (by a signatory where it needs approval)' }) @IsOptional() @IsBoolean() alreadySent?: boolean;
}

export class UpdateLetterDto extends PartialType(OmitType(CreateLetterDto, ['direction', 'markToId', 'action', 'actionDue', 'alreadySent'] as const)) {}

export class ListLettersQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'A project id, or HO for head office letters' }) @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional({ enum: LETTER_DIRECTIONS }) @IsOptional() @IsIn(list(LETTER_DIRECTIONS)) direction?: LetterDirection;
  @ApiPropertyOptional({ enum: LETTER_STATUSES }) @IsOptional() @IsIn(list(LETTER_STATUSES)) status?: LetterStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() riskId?: string;
  @ApiPropertyOptional({ description: 'Marked to me and not acted on' }) @IsOptional() @QueryBool() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ description: 'Waiting for my signature' }) @IsOptional() @QueryBool() @IsBoolean() toSign?: boolean;
  @ApiPropertyOptional({ description: 'A reply due and none gone' }) @IsOptional() @QueryBool() @IsBoolean() awaitingReply?: boolean;
  @ApiPropertyOptional({ description: 'Past its reply or action date' }) @IsOptional() @QueryBool() @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ description: 'Contractual letters sent with no proof of delivery' }) @IsOptional() @QueryBool() @IsBoolean() proofMissing?: boolean;
  @ApiPropertyOptional({ description: 'Received and not marked to anyone' }) @IsOptional() @QueryBool() @IsBoolean() unmarked?: boolean;
  @ApiPropertyOptional({ enum: LIST_SORT_FIELDS.letters, default: 'letterDate' }) @IsOptional() @IsIn(list(LIST_SORT_FIELDS.letters)) sortBy?: LetterSortField;
}

export class MarkLetterDto {
  @ApiProperty({ description: 'The person who must act' }) @IsUUID() toId: string;
  @ApiProperty({ enum: LETTER_ACTIONS }) @IsIn(list(LETTER_ACTIONS)) action: LetterAction;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() dueOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class SendForApprovalDto {
  @ApiPropertyOptional({ description: 'Who signs it; the one already named if left out' }) @IsOptional() @opt() @IsUUID() signatoryId?: string | null;
}

export class LetterNoteDto {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(1000) note?: string | null;
}

export class ReturnLetterDto {
  @ApiProperty({ description: 'What to change' }) @trim() @IsString() @IsNotEmpty() @MaxLength(1000) note: string;
}

export class DispatchLetterDto {
  @ApiProperty({ enum: LETTER_MODES }) @IsIn(list(LETTER_MODES)) mode: LetterMode;
  @ApiPropertyOptional({ description: 'Speed post, registered post or courier number' }) @IsOptional() @trim() @IsString() @MaxLength(60) docketNo?: string | null;
  @ApiProperty() @IsDateString() dispatchedOn: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsDateString() deliveredOn?: string | null;
  @ApiPropertyOptional({ example: 'Acknowledged copy signed by the EE office', description: 'How delivery is shown' }) @IsOptional() @trim() @IsString() @MaxLength(300) deliveryProof?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'The receipt or acknowledged copy, added to the letter' }) @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) attachmentIds?: string[];
}

/* ---------- address book ---------- */

export class LetterContactInput {
  @ApiProperty({ example: 'The Executive Engineer' }) @trim() @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @ApiPropertyOptional({ example: 'Road Division No. 2, Cuttack' }) @IsOptional() @trim() @IsString() @MaxLength(200) office?: string | null;
  @ApiPropertyOptional({ example: 'Works Department' }) @IsOptional() @trim() @IsString() @MaxLength(200) organisation?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(500) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @trim() @IsEmail() @MaxLength(200) email?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(30) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @opt() @IsUUID() clientId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLetterContactDto extends PartialType(LetterContactInput) {}

export class ListLetterContactsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Include ones switched off' }) @IsOptional() @QueryBool() @IsBoolean() all?: boolean;
}

/* ---------- numbering and approval ---------- */

export class LetterSettingsInput {
  @ApiProperty({ enum: LETTER_APPROVAL_RULES }) @IsIn(list(LETTER_APPROVAL_RULES)) approval: LetterApprovalRule;
  @ApiPropertyOptional({ enum: LETTER_APPROVAL_RULES, description: 'Item 169: which signed letters then wait for a director\'s seal at head office (never more than `approval` reaches)' })
  @IsOptional()
  @IsIn(list(LETTER_APPROVAL_RULES))
  seal?: LetterApprovalRule;
}

export class LetterSeriesInput {
  @ApiPropertyOptional({ description: 'Null for head office' }) @IsOptional() @opt() @IsUUID() projectId?: string | null;
  @ApiProperty({ enum: LETTER_DIRECTIONS }) @IsIn(list(LETTER_DIRECTIONS)) direction: LetterDirection;
  @ApiProperty({ example: 'P07' }) @trim() @IsString() @IsNotEmpty() @MaxLength(20) prefix: string;
  @ApiProperty({ example: '{PREFIX}/{DIR}/{FY}/{NNN}' }) @trim() @IsString() @IsNotEmpty() @MaxLength(60) pattern: string;
}

export class UpdateLetterSeriesDto extends PartialType(OmitType(LetterSeriesInput, ['projectId', 'direction'] as const)) {}

/* ---------- templates ---------- */

export class LetterTemplateInput {
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @opt() @IsString() @MaxLength(60) category?: string | null;
  @ApiProperty() @trim() @IsString() @IsNotEmpty() @MaxLength(300) subject: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(20000) body: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLetterTemplateDto extends PartialType(LetterTemplateInput) {}
