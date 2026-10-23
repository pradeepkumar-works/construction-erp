import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNumberString, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class CreateBoqItemDto {
  @ApiProperty({ example: '1.01' }) @IsString() @MinLength(1) itemNo: string;
  @ApiProperty() @IsString() @MinLength(2) description: string;
  @ApiProperty({ example: 'Cum' }) @IsString() unit: string;
  @ApiProperty({ example: '450.00' }) @IsNumberString() rate: string;
  @ApiProperty({ example: '1200' }) @IsNumberString() originalQty: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() revisedQty?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Bill section or cost centre, e.g. Civil works', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80) section?: string | null;
  @ApiPropertyOptional({ description: 'Component or sub-component (work breakdown)', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional({ description: 'Schedule of rates item the rate comes from', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() sorItemId?: string | null;
  @ApiPropertyOptional({ description: 'The rate item number as printed, e.g. SOR 4.1.3', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(60) sorRef?: string | null;
}
export class UpdateBoqItemDto extends PartialType(CreateBoqItemDto) {}

export class BulkBoqDto {
  @ApiProperty({ type: [CreateBoqItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBoqItemDto)
  items: CreateBoqItemDto[];
}

export class CreateActivityDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty({ example: 'Cum' }) @IsString() unit: string;
  @ApiProperty({ example: '1200' }) @IsNumberString() plannedQty: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() boqItemId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedStart?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() plannedEnd?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsUUID() responsibleId?: string | null;
  @ApiPropertyOptional({ description: 'Checklist a new inspection of this activity starts from' }) @IsOptional() @IsUUID() checklistTemplateId?: string | null;
  @ApiPropertyOptional({ description: 'Hold point: progress is approved only after a passed inspection' }) @IsOptional() @IsBoolean() holdPoint?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Component or sub-component (work breakdown); a sub-activity takes its activity\'s', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() workElementId?: string | null;
  @ApiPropertyOptional({ description: 'The activity this is a sub-activity of', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() parentActivityId?: string | null;
  @ApiPropertyOptional({ description: 'Share of its activity or component, %; empty shares what is left by BOQ value', nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsNumberString() weightPct?: string | null;
}
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
