import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { MATERIAL_APPROVAL_KINDS, MATERIAL_REVIEW_OUTCOMES, type MaterialApprovalKind, type MaterialReviewOutcome } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value));
const nullable = () => ValidateIf((_, v) => v !== null && v !== undefined);

export class MaterialApprovalQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ description: 'open (draft, under review, back with us; the default), decided, or all' }) @IsOptional() @IsIn(['open', 'review', 'decided', 'all']) status?: 'open' | 'review' | 'decided' | 'all';
  @ApiPropertyOptional({ enum: MATERIAL_APPROVAL_KINDS }) @IsOptional() @IsIn(MATERIAL_APPROVAL_KINDS as unknown as string[]) kind?: MaterialApprovalKind;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ApprovedMakeQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class ApprovalFields {
  @ApiPropertyOptional({ enum: MATERIAL_APPROVAL_KINDS }) @IsOptional() @IsIn(MATERIAL_APPROVAL_KINDS as unknown as string[]) kind?: MaterialApprovalKind;
  @ApiPropertyOptional({ description: 'The item on the item master it is for' }) @IsOptional() @nullable() @IsUUID() itemId?: string | null;
  @ApiPropertyOptional({ description: 'The BOQ item it is used in' }) @IsOptional() @nullable() @IsUUID() boqItemId?: string | null;
  @ApiPropertyOptional({ example: 'Pre-mixed tile adhesive, type 2' }) @IsOptional() @trim() @IsString() @MaxLength(200) model?: string | null;
  @ApiPropertyOptional({ description: 'The supplier offering it' }) @IsOptional() @nullable() @IsUUID() vendorId?: string | null;
  @ApiPropertyOptional({ example: 'Wards and corridors, all floors' }) @IsOptional() @trim() @IsString() @MaxLength(300) usedFor?: string | null;
  @ApiPropertyOptional({ description: 'Why this make: the specification clause, IS code, equal to a listed make' }) @IsOptional() @trim() @IsString() @MaxLength(4000) note?: string | null;
  @ApiPropertyOptional({ example: '2026-11-20' }) @IsOptional() @nullable() @IsDateString() replyBy?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class CreateMaterialApprovalDto extends ApprovalFields {
  @ApiProperty() @IsUUID('4', { message: 'Choose the project' }) projectId: string;
  @ApiProperty({ example: 'Vitrified floor tiles 600 x 600' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the material' }) @MaxLength(200) material: string;
  @ApiProperty({ example: 'Kajaria' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the make' }) @MaxLength(120) make: string;
  @ApiProperty({ example: 'Er. S. K. Rath, Executive Engineer' }) @trim() @IsString() @IsNotEmpty({ message: 'Say who it goes to' }) @MaxLength(200) toParty: string;
}

export class UpdateMaterialApprovalDto extends ApprovalFields {
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the material' }) @MaxLength(200) material?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the make' }) @MaxLength(120) make?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Say who it goes to' }) @MaxLength(200) toParty?: string;
}

/** Send the request (again) to the reviewer: the first time from draft, or a new revision after revise or reject. */
export class SubmitMaterialApprovalDto {
  @ApiProperty({ example: '2026-11-04' }) @IsDateString({}, { message: 'Choose the day it was submitted' }) submittedOn: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsDateString() replyBy?: string | null;
  @ApiPropertyOptional({ description: 'Covering note, or what changed in this revision' }) @IsOptional() @trim() @IsString() @MaxLength(2000) note?: string | null;
  @ApiPropertyOptional({ description: 'A revision may propose another make' }) @IsOptional() @trim() @IsString() @IsNotEmpty({ message: 'Name the make' }) @MaxLength(120) make?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) model?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'The files as they now stand' }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsUUID('4', { each: true }) attachmentIds?: string[];
}

export class ReviewMaterialApprovalDto {
  @ApiProperty({ enum: MATERIAL_REVIEW_OUTCOMES }) @IsIn(MATERIAL_REVIEW_OUTCOMES as unknown as string[], { message: 'Choose what the reviewer decided' }) outcome: MaterialReviewOutcome;
  @ApiProperty({ example: '2026-11-08' }) @IsDateString({}, { message: 'Choose the day of the review' }) reviewedOn: string;
  @ApiPropertyOptional({ example: 'Er. S. K. Rath' }) @IsOptional() @trim() @IsString() @MaxLength(120) reviewerName?: string | null;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(4000) comments?: string | null;
  @ApiPropertyOptional({ example: 'EE/BBSR/2026/1142' }) @IsOptional() @trim() @IsString() @MaxLength(120) reviewRef?: string | null;
}

export class WithdrawMaterialApprovalDto {
  @ApiProperty() @trim() @IsString() @IsNotEmpty({ message: 'Say why it is withdrawn' }) @MaxLength(1000) note: string;
}

export class CreateApprovedMakeDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the project' }) projectId: string;
  @ApiProperty({ example: 'Cement OPC 53' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the material' }) @MaxLength(200) material: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsUUID() itemId?: string | null;
  @ApiProperty({ example: 'UltraTech' }) @trim() @IsString() @IsNotEmpty({ message: 'Name the make' }) @MaxLength(120) make: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(200) model?: string | null;
  @ApiPropertyOptional({ example: 'Contract, Annexure 4' }) @IsOptional() @trim() @IsString() @MaxLength(300) note?: string | null;
}

export class MakeCheckLine {
  @ApiProperty() @IsString() @MaxLength(300) itemName: string;
  @ApiPropertyOptional() @IsOptional() @nullable() @IsString() @MaxLength(120) make?: string | null;
}

export class MakeCheckDto {
  @ApiProperty() @IsUUID('4', { message: 'Choose the project' }) projectId: string;
  @ApiProperty({ type: [MakeCheckLine] }) @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => MakeCheckLine) lines: MakeCheckLine[];
}
