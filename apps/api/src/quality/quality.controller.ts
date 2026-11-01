import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QualityService } from './quality.service';
import { CreateNcrDto, CreateTestDto, ListNcrsQuery, ListTestsQuery, NcrActionDto, NcrCloseDto, NcrReopenDto, QualitySummaryQuery, RecordReadingDto, UpdateNcrDto, UpdateTestDto } from './quality.dto';

@ApiTags('quality')
@ApiBearerAuth()
@Controller('quality')
export class QualityController {
  constructor(private quality: QualityService) {}

  @ApiOperation({ summary: 'Counts for the Quality page: inspections waiting, tests pending / overdue / failed, NCRs open / overdue' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: QualitySummaryQuery) {
    return this.quality.summary(user, q.projectId);
  }

  @Get('tests')
  listTests(@CurrentUser() user: RequestUser, @Query() q: ListTestsQuery) {
    return this.quality.listTests(user, q);
  }

  @Get('tests/:id')
  getTest(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.quality.getTest(user, id);
  }

  @ApiOperation({
    summary: 'Record a test (sample taken)',
    description:
      'Numbered TST-<year>-0001. Without `readings` a test gets its kind’s usual ones (concrete cubes: 7 and 28 days after sampling). ' +
      'With specMin / specMax the last reading decides PASS or FAIL; without, `result` is as recorded. A failed test notifies QA/QC and the project manager.',
  })
  @Post('tests')
  createTest(@CurrentUser() user: RequestUser, @Body() dto: CreateTestDto) {
    return this.quality.createTest(user, dto);
  }

  @ApiOperation({ summary: 'Change a test', description: '`readings`, when given, is the complete list. The specification and result are changed only by whoever recorded it, QA/QC or an approver.' })
  @Patch('tests/:id')
  updateTest(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateTestDto) {
    return this.quality.updateTest(user, id, dto);
  }

  @ApiOperation({ summary: "Enter one reading's value (tested today unless `testedOn` is given)" })
  @Post('tests/:id/readings/:readingId')
  recordReading(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('readingId') readingId: string, @Body() dto: RecordReadingDto) {
    return this.quality.recordReading(user, id, readingId, dto);
  }

  @Delete('tests/:id')
  removeTest(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.quality.removeTest(user, id);
  }

  @Get('ncrs')
  listNcrs(@CurrentUser() user: RequestUser, @Query() q: ListNcrsQuery) {
    return this.quality.listNcrs(user, q);
  }

  @Get('ncrs/:id')
  getNcr(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.quality.getNcr(user, id);
  }

  @Get('ncrs/:id/history')
  ncrHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.quality.ncrHistory(user, id);
  }

  @ApiOperation({
    summary: 'Raise a non-conformance report',
    description: 'QA/QC or an approver. Numbered NCR-<year>-0001; may refer to the inspection or test that found it. Notifies the person to rectify it and the project manager (major and critical ones, the approvers too).',
  })
  @Post('ncrs')
  createNcr(@CurrentUser() user: RequestUser, @Body() dto: CreateNcrDto) {
    return this.quality.createNcr(user, dto);
  }

  @Patch('ncrs/:id')
  updateNcr(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateNcrDto) {
    return this.quality.updateNcr(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the cause and corrective action (site)', description: 'The NCR moves to ACTION_TAKEN and its raiser is told to verify it.' })
  @Post('ncrs/:id/action')
  action(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: NcrActionDto) {
    return this.quality.recordAction(user, id, dto);
  }

  @ApiOperation({ summary: 'Close an NCR after verifying the action (QA/QC or an approver)' })
  @Post('ncrs/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: NcrCloseDto) {
    return this.quality.close(user, id, dto);
  }

  @ApiOperation({ summary: 'Reopen an NCR: the action did not put it right' })
  @Post('ncrs/:id/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: NcrReopenDto) {
    return this.quality.reopen(user, id, dto);
  }

  @Delete('ncrs/:id')
  removeNcr(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.quality.removeNcr(user, id);
  }
}
