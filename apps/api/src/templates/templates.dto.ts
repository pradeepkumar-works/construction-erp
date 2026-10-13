import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { MAX_TEMPLATE_DAYS, MAX_TEMPLATE_ITEMS } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class TemplateItemDto {
  @ApiProperty({ example: 'GSB laying' }) @trim() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiProperty({ example: 'Cum' }) @trim() @IsString() @IsNotEmpty() @MaxLength(20) unit: string;
  @ApiProperty({ example: 90, description: 'Planned start in days from the project start' }) @IsInt() @Min(0) @Max(MAX_TEMPLATE_DAYS) startDay: number;
  @ApiProperty({ example: 90 }) @IsInt() @Min(1) @Max(MAX_TEMPLATE_DAYS) durationDays: number;
}

export class SaveTemplateDto {
  @ApiProperty({ type: [TemplateItemDto], description: 'The whole list in order; an empty list goes back to the built-in one' })
  @IsArray()
  @ArrayMaxSize(MAX_TEMPLATE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items: TemplateItemDto[];
}

export class ApplyTemplateDto {
  @ApiPropertyOptional({ type: [String], description: 'Only these template activities (by name); all when omitted' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  names?: string[];
}
