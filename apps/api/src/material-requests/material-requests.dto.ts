import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumberString, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { MATERIAL_PRIORITIES, MaterialPriority, SUBMISSION_STATUSES, SubmissionStatus } from '@erp/shared';
import { CLIENT_ID_DOC } from '../common/idempotency';

export class MaterialRequestItemInput {
  @ApiProperty({ example: 'OPC 53 Grade Cement' }) @IsString() @MinLength(2) itemName: string;
  @ApiPropertyOptional({ example: 'UltraTech / ACC, 50kg bags' }) @IsOptional() @IsString() specification?: string;
  @ApiProperty({ example: 'Bags' }) @IsString() unit: string;
  @ApiProperty({ example: '200' }) @IsNumberString() quantity: string;
}

export class CreateMaterialRequestDto {
  @ApiPropertyOptional(CLIENT_ID_DOC) @IsOptional() @IsUUID('4') id?: string;
  @ApiProperty() @IsUUID() projectId: string;
  @ApiProperty({ example: '2026-10-20' }) @IsDateString() requiredDate: string;
  @ApiPropertyOptional({ enum: MATERIAL_PRIORITIES, default: 'NORMAL' }) @IsOptional() @IsIn(MATERIAL_PRIORITIES as unknown as string[]) priority?: MaterialPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() remarks?: string;
  @ApiProperty({ type: [MaterialRequestItemInput] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MaterialRequestItemInput) items: MaterialRequestItemInput[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) attachmentIds?: string[];
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() submit?: boolean;
}

export class UpdateMaterialRequestDto extends PartialType(CreateMaterialRequestDto) {}

export class ListMaterialRequestQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional({ enum: SUBMISSION_STATUSES }) @IsOptional() @IsIn(SUBMISSION_STATUSES as unknown as string[]) status?: SubmissionStatus;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() mine?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) limit?: number;
}
