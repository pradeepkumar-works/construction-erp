import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class BillingReadinessQuery {
  @ApiPropertyOptional({ description: 'One project; all the caller may see when left out' }) @IsOptional() @IsUUID() projectId?: string;
}
