import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ProgressReportQuery } from './reports.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @ApiOperation({
    summary: 'Weekly / monthly progress report of a project',
    description:
      'Built from approved progress, DPRs, machinery logs and measurements, plus attendance and the store register, for any period up to 92 days. Physical progress at the start and end of the period, executed and measured value, activity and BOQ tables, manpower, machinery, material, issues, next-period plan and photos. The web prints it to PDF.',
  })
  @Get('progress')
  progress(@CurrentUser() user: RequestUser, @Query() q: ProgressReportQuery) {
    return this.reports.progress(user, q);
  }
}
