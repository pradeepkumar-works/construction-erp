import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchQuery {
  @ApiPropertyOptional({ description: 'Number, name or words to look for (2 characters or more)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
