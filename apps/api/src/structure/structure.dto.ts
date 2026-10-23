import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNumberString, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { WORK_ELEMENT_TYPES, type WorkElementType } from '@erp/shared';

export const MAX_PLAN_LINES = 300;
export const MAX_IMPORT_ROWS = 500;

/** One activity or sub-activity of a new component, as the template laid it out and the planner changed it. */
export class PlanLineDto {
  @ApiProperty({ example: '3' }) @IsString() @MaxLength(20) key: string;
  @ApiPropertyOptional({ description: 'Key of the activity this is a sub-activity of', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20) parentKey?: string | null;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) name: string;
  @ApiProperty({ example: 'Cum' }) @IsString() @MinLength(1) @MaxLength(20) unit: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() weightPct?: string | null;
  @ApiPropertyOptional({ description: 'Planned quantity; empty is 0 until the planner fills it in', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsNumberString() plannedQty?: string | null;
}

export class CreateWorkElementDto {
  @ApiPropertyOptional({ description: 'The component this is a sub-component of', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() parentId?: string | null;
  @ApiPropertyOptional({ description: 'Outline number, e.g. 3 or 3.2; the next free one when empty' }) @IsOptional() @IsString() @MaxLength(20) code?: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiProperty({ enum: WORK_ELEMENT_TYPES }) @IsIn(WORK_ELEMENT_TYPES as unknown as string[]) elementType: WorkElementType;
  @ApiPropertyOptional({ description: 'Numbers the template uses, e.g. { "capacityKl": 650, "stagingM": 16 }', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() specs?: Record<string, number> | null;
  @ApiPropertyOptional({ description: 'Share of its parent or of the project, %; empty shares what is left by BOQ value', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() weightPct?: string | null;
  @ApiPropertyOptional({ type: [PlanLineDto], description: 'Activities to create under it (from its template)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PLAN_LINES)
  @ValidateNested({ each: true })
  @Type(() => PlanLineDto)
  activities?: PlanLineDto[];
}

export class UpdateWorkElementDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(20) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ enum: WORK_ELEMENT_TYPES }) @IsOptional() @IsIn(WORK_ELEMENT_TYPES as unknown as string[]) elementType?: WorkElementType;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsObject() specs?: Record<string, number> | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() weightPct?: string | null;
}

export class ReorderWorkElementsDto {
  @ApiProperty({ type: [String], description: 'Components (or the sub-components of one component) in their new order' })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class ImportElementRowDto {
  @ApiProperty({ example: '3.2' }) @IsString() @MinLength(1) @MaxLength(20) code: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiPropertyOptional({ enum: WORK_ELEMENT_TYPES }) @IsOptional() @IsIn(WORK_ELEMENT_TYPES as unknown as string[]) elementType?: WorkElementType;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null && v !== '') @IsNumberString() weightPct?: string | null;
}

export class ImportWorkElementsDto {
  @ApiProperty({ type: [ImportElementRowDto] })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ImportElementRowDto)
  rows: ImportElementRowDto[];
}
