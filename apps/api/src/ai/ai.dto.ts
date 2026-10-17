import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { AI_QUESTION_MAX } from '@erp/shared';

export class AiPageContextDto {
  @ApiPropertyOptional({ example: '/projects/6f1c…', description: 'The page the question is asked from' }) @IsOptional() @IsString() @MaxLength(300) path?: string;
  @ApiPropertyOptional({ description: "The header's project, when one is picked" }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() projectId?: string | null;
}

export class AskDto {
  @ApiProperty({ example: 'Which purchase orders are late on the Jajpur road?' }) @IsString() @MinLength(2) @MaxLength(AI_QUESTION_MAX) question!: string;
  @ApiPropertyOptional({ description: 'Continue this conversation; omit to start a new one' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() threadId?: string | null;
  @ApiPropertyOptional({ type: AiPageContextDto }) @IsOptional() @ValidateNested() @Type(() => AiPageContextDto) page?: AiPageContextDto;
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
}
