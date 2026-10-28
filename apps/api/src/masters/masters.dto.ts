import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { MASTER_NAME_MAX } from '@erp/shared';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateMasterEntryDto {
  @ApiProperty({ example: 'Shuttering carpenter' }) @trim() @IsString() @MinLength(1) @MaxLength(MASTER_NAME_MAX) name: string;
  @ApiPropertyOptional({ example: 'शटरिंग बढ़ई' }) @IsOptional() @trim() @IsString() @MaxLength(MASTER_NAME_MAX) nameHi?: string | null;
}

export class UpdateMasterEntryDto {
  @ApiPropertyOptional({ description: 'Only while no record uses the entry' }) @IsOptional() @trim() @IsString() @MinLength(1) @MaxLength(MASTER_NAME_MAX) name?: string;
  @ApiPropertyOptional() @IsOptional() @trim() @IsString() @MaxLength(MASTER_NAME_MAX) nameHi?: string | null;
  @ApiPropertyOptional({ description: 'Switched off: no longer suggested, kept on old records' }) @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ description: "Place among the company's own entries" }) @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
