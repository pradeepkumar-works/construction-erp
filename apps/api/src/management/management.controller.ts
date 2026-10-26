import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MANAGEMENT_REPORT_KEYS, type ManagementReportKey } from '@erp/shared';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ManagementService } from './management.service';
import { ManagementReportsService } from './management-reports.service';
import { ManagementReportQuery } from './management.dto';

@ApiTags('management')
@ApiBearerAuth()
@Controller('management')
export class ManagementController {
  constructor(private management: ManagementService, private reports: ManagementReportsService) {}

  @ApiOperation({
    summary: 'The portfolio: every contract project with its schedule, money from work done to cash, cost and health',
    description:
      'Management, accounts and project managers (`canSeeManagement`), over the projects the caller sees (stores and RMC plants left out). Work done counts each BOQ item at the larger of its approved progress and measurement; committed is open purchase and work orders not yet billed; each project carries the reasons it needs attention. With the approvals waiting by age, billed, received and cost for 12 months, and the cash forecast’s headline for those who see it.',
  })
  @Get('portfolio')
  portfolio(@CurrentUser() user: RequestUser) {
    return this.management.portfolio(user);
  }

  @ApiOperation({ summary: "One project's drill-down: its portfolio row, cost by head against budget, 12 months, open bills, approvals waiting, open risks and open orders" })
  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.management.project(user, id);
  }

  @ApiOperation({
    summary: 'A management report: figures and tables for the screen, print and Excel',
    description: `One of ${MANAGEMENT_REPORT_KEYS.join(', ')}. \`month\` for the monthly MIS, \`from\` and \`to\` for profit and loss, procurement and labour (the financial year so far by default), today for the rest; \`projectId\` limits it to one project.`,
  })
  @Get('reports/:key')
  report(@CurrentUser() user: RequestUser, @Param('key') key: string, @Query() q: ManagementReportQuery) {
    if (!(MANAGEMENT_REPORT_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`No such report: choose one of ${MANAGEMENT_REPORT_KEYS.join(', ')}`);
    return this.reports.report(user, key as ManagementReportKey, q);
  }
}
