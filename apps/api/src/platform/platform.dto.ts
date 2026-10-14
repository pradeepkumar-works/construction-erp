import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuspendDto {
  @ApiProperty({ example: 'Unpaid since August', description: 'Why (kept for Nirmaan staff and in the company audit log)' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
