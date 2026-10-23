import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { WARNING_KINDS, WARNING_OUTCOMES, type WarningKind, type WarningOutcome } from '@erp/shared';

export class WarningKeyDto {
  @ApiProperty({ description: "The warning's key, as the watch list gives it" }) @IsString() @MaxLength(300) key!: string;
}

export class DismissWarningDto extends WarningKeyDto {
  @ApiProperty({ enum: WARNING_OUTCOMES, description: 'What became of it: FIXED (acted on), KNOWN (true, left for a reason), WRONG (counts against the check)' })
  @IsIn(WARNING_OUTCOMES as unknown as string[])
  outcome!: WarningOutcome;
  @ApiPropertyOptional({ description: 'A note: why, for KNOWN (required, 3 letters or more); optional otherwise' }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class WarningKindDto {
  @ApiProperty({ enum: WARNING_KINDS }) @IsIn(WARNING_KINDS as unknown as string[]) kind!: WarningKind;
}
