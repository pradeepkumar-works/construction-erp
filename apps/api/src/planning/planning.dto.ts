import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNumberString, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';

export class CreateBoqItemDto {
  @ApiProperty({ example: '1.01' }) @IsString() @MinLength(1) itemNo: string;
  @ApiProperty() @IsString() @MinLength(2) description: string;
  @ApiProperty({ example: 'Cum' }) @IsString() unit: string;
  @ApiProperty({ example: '450.00' }) @IsNumberString() rate: string;
  @ApiProperty({ example: '1200' }) @IsNumberString() originalQty: string;
  @ApiPropertyOptional() @IsOptional() @IsNumberString() revisedQty?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
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
}
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
