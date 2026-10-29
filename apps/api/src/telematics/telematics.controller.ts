import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TelematicsService } from './telematics.service';

export class MachineDaysQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() equipmentId?: string;
  @ApiPropertyOptional({ example: '2026-10-01' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ example: '2026-10-07' }) @IsOptional() @IsDateString() to?: string;
}

export class MachineDayQuery {
  @ApiProperty() @IsUUID() equipmentId: string;
  @ApiProperty({ example: '2026-10-07' }) @IsDateString() date: string;
}

/** Engine hours from trackers and makers' feeds (item 146). */
@ApiTags('telematics')
@ApiBearerAuth()
@Controller('telematics')
export class TelematicsController {
  constructor(private svc: TelematicsService) {}

  @ApiOperation({ summary: "Each tracked machine's days (the last week by default) with its log beside it" })
  @Get('days')
  days(@CurrentUser() user: RequestUser, @Query() q: MachineDaysQuery) {
    return this.svc.days(user, q);
  }

  @ApiOperation({ summary: "One machine's day from its tracker, for the log form; null when nothing was read" })
  @Get('day')
  day(@CurrentUser() user: RequestUser, @Query() q: MachineDayQuery) {
    return this.svc.day(user, q.equipmentId, q.date.slice(0, 10));
  }
}
