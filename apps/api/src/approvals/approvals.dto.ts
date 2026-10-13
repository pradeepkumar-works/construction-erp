import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { REVIEW_DECISIONS, ReviewDecision } from '@erp/shared';

export class ReviewDto {
  @ApiProperty({ enum: REVIEW_DECISIONS }) @IsIn(REVIEW_DECISIONS as unknown as string[]) decision: ReviewDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}
