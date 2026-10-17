import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class BriefOptInDto {
  @ApiProperty({ description: 'Get a three-line brief each morning on the home page, by email and (when on) WhatsApp' }) @IsBoolean() morningBrief!: boolean;
}
