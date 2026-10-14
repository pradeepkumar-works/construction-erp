import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class GstRangeQuery {
  @ApiProperty({ example: '2026-10-01' }) @IsDateString() from: string;
  @ApiProperty({ example: '2026-10-31' }) @IsDateString() to: string;
}
