import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Km 12 to Km 20 handed over' }) @IsString() @MinLength(2) @MaxLength(200) name: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional({ description: 'The date it was reached; null to clear' }) @IsOptional() @IsDateString() achievedOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

export class FreezeBaselineDto {
  @ApiPropertyOptional({ example: 'As agreed with the client at the kick-off meeting' }) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
