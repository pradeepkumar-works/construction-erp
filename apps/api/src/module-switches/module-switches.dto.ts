import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetModuleSwitchDto {
  @ApiProperty({ description: 'On (in use) or off (hidden and refused; its data is kept)' }) @IsBoolean() on: boolean;
}
