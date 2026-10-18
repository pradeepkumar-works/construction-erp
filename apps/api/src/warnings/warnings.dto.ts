import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { WARNING_DISMISS_MIN } from '@erp/shared';

export class WarningKeyDto {
  @ApiProperty({ description: "The warning's key, as the watch list gives it" }) @IsString() @MaxLength(300) key!: string;
}

export class DismissWarningDto extends WarningKeyDto {
  @ApiProperty({ description: 'Why it can be dismissed' }) @IsString() @MinLength(WARNING_DISMISS_MIN) @MaxLength(500) reason!: string;
}
