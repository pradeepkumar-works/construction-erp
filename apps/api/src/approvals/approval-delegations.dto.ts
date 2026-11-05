import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CreateApprovalDelegationDto {
  @ApiPropertyOptional({ description: 'Who is away: left out, the caller. Only an admin sets someone else’s.' }) @IsOptional() @IsUUID() fromUserId?: string;
  @ApiProperty({ description: 'Who decides their approvals meanwhile' }) @IsUUID() toUserId: string;
  @ApiProperty({ example: '2026-11-10', description: 'First day (company date)' }) @Matches(DAY, { message: 'Enter the first day as a date' }) startsOn: string;
  @ApiProperty({ example: '2026-11-20', description: 'Last day, included' }) @Matches(DAY, { message: 'Enter the last day as a date' }) endsOn: string;
  @ApiPropertyOptional({ example: 'On leave' }) @IsOptional() @IsString() @MaxLength(200) note?: string;
}
