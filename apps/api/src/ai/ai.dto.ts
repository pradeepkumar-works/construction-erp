import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { AI_LANGUAGES, AI_QUESTION_MAX, AI_ROLE_CHOICES, DOC_READ_KINDS, type AiLanguage, type DocReadKind, type RoleKey } from '@erp/shared';
import { PageQuery } from '../common/paging';

export class AiPageContextDto {
  @ApiPropertyOptional({ example: '/projects/6f1c…', description: 'The page the question is asked from' }) @IsOptional() @IsString() @MaxLength(300) path?: string;
  @ApiPropertyOptional({ description: "The header's project, when one is picked" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
}

export class AskDto {
  @ApiProperty({ example: 'Which purchase orders are late on the Jajpur road?' }) @IsString() @MinLength(2) @MaxLength(AI_QUESTION_MAX) question!: string;
  @ApiPropertyOptional({ description: 'Continue this conversation; omit to start a new one' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() threadId?: string | null;
  @ApiPropertyOptional({ type: AiPageContextDto }) @IsOptional() @ValidateNested() @Type(() => AiPageContextDto) page?: AiPageContextDto;
  @ApiPropertyOptional({ enum: AI_LANGUAGES, description: 'Answer in this language (the site app passes its own); English when left out' }) @IsOptional() @IsIn(AI_LANGUAGES as unknown as string[]) language?: AiLanguage;
  @ApiPropertyOptional({ enum: ['web', 'phone'], description: "phone: the site app's Ask tab" }) @IsOptional() @IsIn(['web', 'phone']) client?: 'web' | 'phone';
  @ApiPropertyOptional({ description: "Model comparison only: one of the server's AI_EVAL_MODELS" }) @IsOptional() @IsString() @MaxLength(100) model?: string;
}

export class AiFeedbackDto {
  @ApiProperty({ enum: [1, -1], nullable: true, description: '1 helpful, -1 not helpful, null to clear' }) @ValidateIf((_, v) => v !== null) @IsIn([1, -1]) value!: 1 | -1 | null;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ description: 'Ask Nirmaan on for the whole company' }) @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'Rupees per calendar month; null for the server default' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  monthlyCapInr?: number | null;
  @ApiPropertyOptional({ enum: AI_ROLE_CHOICES, isArray: true, description: 'Roles besides admins that may use it; an empty list opens it to all staff' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(AI_ROLE_CHOICES.length)
  @IsIn(AI_ROLE_CHOICES, { each: true, message: 'Choose roles from the list' })
  roles?: RoleKey[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class AiSettingsQueryDto {
  @ApiPropertyOptional({ example: '2026-09', description: 'The month to show use for; the current one when left out' }) @IsOptional() @Matches(MONTH, { message: 'Give the month as YYYY-MM' }) month?: string;
}

export class AiConversationsQueryDto extends PageQuery {
  @ApiPropertyOptional({ description: 'Only this person' }) @IsOptional() @IsUUID() userId?: string;
  @ApiPropertyOptional({ example: '2026-09', description: 'Only conversations with a question or answer in this month' }) @IsOptional() @Matches(MONTH, { message: 'Give the month as YYYY-MM' }) month?: string;
}

export class ReadDocumentDto {
  @ApiProperty({ enum: DOC_READ_KINDS, description: 'invoice fills a vendor bill, challan a GRN, drawing a document register entry' }) @IsIn(DOC_READ_KINDS as unknown as string[]) kind!: DocReadKind;
  @ApiPropertyOptional({ description: 'Invoices: the order the form is already on, to match the lines against' }) @IsOptional() @IsUUID() purchaseOrderId?: string;
}
