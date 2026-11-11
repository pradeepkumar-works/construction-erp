import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReportBuilderService } from './report-builder.service';
import { ListSavedReportsQuery, ReportRunQuery, RunReportDto, SaveReportDto, ScheduleReportDto, SourceQuery } from './report-builder.dto';

@ApiTags('report-builder')
@ApiBearerAuth()
@Controller('report-builder')
export class ReportBuilderController {
  constructor(private reports: ReportBuilderService) {}

  @ApiOperation({ summary: 'The sources the caller may build a report over, each with the columns their role is offered (custom fields included)' })
  @Get('sources')
  sources(@CurrentUser() user: RequestUser) {
    return this.reports.sources(user);
  }

  @ApiOperation({
    summary: 'Run a report that is not saved',
    description: 'The definition is checked against the caller’s columns (400 for a column the source does not have or the role does not see); rows come from the source’s own list as the caller.',
  })
  @HttpCode(200)
  @Post('run')
  run(@CurrentUser() user: RequestUser, @Body() dto: RunReportDto) {
    return this.reports.run(user, dto.definition, dto);
  }

  @ApiOperation({ summary: 'People a report over the source can be emailed to: staff whose role opens its list' })
  @Get('recipients')
  recipients(@CurrentUser() user: RequestUser, @Query() q: SourceQuery) {
    return this.reports.recipients(user, q.source);
  }

  @ApiOperation({ summary: 'The caller’s saved reports and those shared with them, over the sources their role opens' })
  @Get('reports')
  list(@CurrentUser() user: RequestUser, @Query() q: ListSavedReportsQuery) {
    return this.reports.list(user, q);
  }

  @Post('reports')
  create(@CurrentUser() user: RequestUser, @Body() dto: SaveReportDto) {
    return this.reports.create(user, dto);
  }

  @Get('reports/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.get(user, id);
  }

  @ApiOperation({ summary: 'A saved report run as the caller; columns their role does not see are left out with a note' })
  @Get('reports/:id/run')
  runSaved(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: ReportRunQuery) {
    return this.reports.runSaved(user, id, q);
  }

  @Patch('reports/:id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveReportDto) {
    return this.reports.update(user, id, dto);
  }

  @Delete('reports/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.remove(user, id);
  }

  @ApiOperation({ summary: 'Email the report weekly or monthly; each recipient’s copy is run as them' })
  @Put('reports/:id/schedule')
  schedule(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleReportDto) {
    return this.reports.setSchedule(user, id, dto);
  }

  @Delete('reports/:id/schedule')
  unschedule(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.removeSchedule(user, id);
  }
}
