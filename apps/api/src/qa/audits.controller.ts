import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QaAuditsService } from './audits.service';
import { QaReportService } from './report.service';
import { AuditsQuery, CloseFindingDto, FindingNcrDto, SaveAuditDto } from './audits.dto';
import { QaReportQuery } from './report.dto';

/** QA/QC part 3 (item 137): audits and visits with their findings, and the monthly quality report. */
@ApiTags('qa')
@ApiBearerAuth()
@Controller('qa')
export class QaAuditsController {
  constructor(
    private audits: QaAuditsService,
    private report: QaReportService,
  ) {}

  @ApiOperation({ summary: 'Internal audits and visits by the client, consultant, third-party inspector or department, newest first' })
  @Get('audits')
  list(@CurrentUser() user: RequestUser, @Query() q: AuditsQuery) {
    return this.audits.list(user, q);
  }

  @Get('audits/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.audits.get(user, id);
  }

  @ApiOperation({ summary: 'Record an audit or visit with its findings' })
  @Post('audits')
  create(@CurrentUser() user: RequestUser, @Body() dto: SaveAuditDto) {
    return this.audits.create(user, dto);
  }

  @Put('audits/:id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAuditDto) {
    return this.audits.update(user, id, dto);
  }

  @Delete('audits/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.audits.remove(user, id);
  }

  @ApiOperation({ summary: 'Close a finding put right without an NCR' })
  @Post('audits/:id/findings/:findingId/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('findingId', ParseUUIDPipe) findingId: string, @Body() dto: CloseFindingDto) {
    return this.audits.closeFinding(user, id, findingId, dto);
  }

  @Post('audits/:id/findings/:findingId/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('findingId', ParseUUIDPipe) findingId: string) {
    return this.audits.reopenFinding(user, id, findingId);
  }

  @ApiOperation({ summary: 'Raise an NCR from a finding (raised by the client when the visit was from outside)' })
  @Post('audits/:id/findings/:findingId/ncr')
  ncr(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('findingId', ParseUUIDPipe) findingId: string, @Body() dto: FindingNcrDto) {
    return this.audits.raiseNcr(user, id, findingId, dto);
  }

  @ApiOperation({ summary: "The month's quality report by project: tests and pass rate, tests short, NCRs by age, category and root cause, rework, audits, calibration, samples and certificates" })
  @Get('report')
  monthly(@CurrentUser() user: RequestUser, @Query() q: QaReportQuery) {
    return this.report.monthly(user, q);
  }
}
