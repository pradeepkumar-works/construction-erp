import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateUnitDto {
  @ApiProperty({ example: 'Cum', description: 'As written on items and lines' }) @trim() @IsString() @MinLength(1) @MaxLength(20) code: string;
  @ApiProperty({ example: 'Cubic metre' }) @trim() @IsString() @MinLength(1) @MaxLength(60) name: string;
}

export class UpdateUnitDto {
  @ApiPropertyOptional({ description: 'Only while no item uses it' }) @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(20) code?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional({ description: 'Switched off: no longer suggested' }) @IsOptional() @IsBoolean() isActive?: boolean;
}
