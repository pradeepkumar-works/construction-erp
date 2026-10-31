import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { TelematicsService } from './telematics.service';
import { FuelDispenseService } from './fuel-dispense.service';

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

/** Engine hours from trackers and makers' feeds, and the tank and dispenser fills. */
@ApiTags('telematics')
@ApiBearerAuth()
@Controller('telematics')
export class TelematicsController {
  constructor(
    private svc: TelematicsService,
    private dispenses: FuelDispenseService,
  ) {}

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

  @ApiOperation({ summary: "A dispenser's fill that was refused as a slip, tried again (whoever issues fuel at its site)" })
  @Post('dispenses/:id/retry')
  retry(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.dispenses.retry(user, id);
  }
}
