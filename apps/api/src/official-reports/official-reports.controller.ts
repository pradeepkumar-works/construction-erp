import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { OfficialReportsService } from './official-reports.service';
import { IssueOfficialReportDto, OfficialIssuesQuery, OfficialReportQuery } from './official-reports.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports/official')
export class OfficialReportsController {
  constructor(private reports: OfficialReportsService) {}

  @ApiOperation({
    summary: 'Official daily, weekly or monthly progress report of a project',
    description:
      'The report for the period holding `date`, built now from the project’s records: a header, numbered chapters of facts, tables, text and photographs, and the signature boxes. Money is left out for roles that may not see the contract. The web draws it and writes it to PDF, Word and Excel.',
  })
  @Get()
  build(@CurrentUser() user: RequestUser, @Query() q: OfficialReportQuery) {
    return this.reports.build(user, q);
  }

  @ApiOperation({ summary: 'The issue register of a project: every report issued to the client, newest first' })
  @Get('issues')
  issues(@CurrentUser() user: RequestUser, @Query() q: OfficialIssuesQuery) {
    return this.reports.issues(user, q.projectId);
  }

  @ApiOperation({ summary: 'An issued report, exactly as it went' })
  @Get('issues/:id')
  issued(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reports.issued(user, id);
  }

  @ApiOperation({ summary: 'Issue the period’s report to the client: kept as it is now, numbered, with the next revision' })
  @Post('issue')
  issue(@CurrentUser() user: RequestUser, @Body() dto: IssueOfficialReportDto) {
    return this.reports.issue(user, dto);
  }
}
