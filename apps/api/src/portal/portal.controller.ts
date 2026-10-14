import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GuestAllowed, GuestOnly } from '../common/decorators';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { CertifyBillDto } from '../ra-bills/ra-bills.dto';
import { InspectionsService } from '../inspections/inspections.service';
import { ReportsService } from '../reports/reports.service';
import { PortalService } from './portal.service';
import { PortalDprQuery, PortalReportQuery, WitnessDto } from './portal.dto';

/** The client portal: the only routes the client's engineer and consultant (guest roles) may call, besides their account. Staff use the full screens. */
@ApiTags('portal')
@ApiBearerAuth()
@GuestAllowed()
@GuestOnly()
@Controller('portal')
export class PortalController {
  constructor(private portal: PortalService, private bills: RaBillsService, private inspections: InspectionsService, private reports: ReportsService) {}

  @ApiOperation({ summary: 'Projects the caller is on, with approved progress, open bills and inspections' })
  @Get('projects')
  projects(@CurrentUser() user: RequestUser) {
    return this.portal.projects(user);
  }

  @ApiOperation({ summary: 'One project with approved progress by activity' })
  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.project(user, id);
  }

  @ApiOperation({ summary: 'Approved DPRs of a project, newest first' })
  @Get('projects/:id/dprs')
  dprs(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PortalDprQuery) {
    return this.portal.dprs(user, id, q);
  }

  @ApiOperation({ summary: 'The progress report for a period (approved data), as staff send it' })
  @Get('projects/:id/report')
  report(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PortalReportQuery) {
    return this.reports.progress(user, { projectId: id, from: q.from, to: q.to });
  }

  @ApiOperation({ summary: 'RA bills sent to the client, newest first' })
  @Get('projects/:id/bills')
  projectBills(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.listForClient(user, id);
  }

  @ApiOperation({ summary: 'Inspections requested on the project (not drafts), newest first' })
  @Get('projects/:id/inspections')
  projectInspections(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.listForClient(user, id);
  }

  @ApiOperation({ summary: 'One RA bill sent to the client, with its measurements' })
  @Get('bills/:id')
  bill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.getForClient(user, id);
  }

  @ApiOperation({ summary: "Certify a sent bill (client's engineer or consultant): the quantities passed, items left out pass as claimed" })
  @Post('bills/:id/certify')
  certify(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CertifyBillDto) {
    return this.bills.certifyAsClient(user, id, dto);
  }

  @ApiOperation({ summary: "Record attending an inspection for the client, with remarks (client's engineer or consultant)" })
  @Post('inspections/:id/witness')
  witness(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WitnessDto) {
    return this.inspections.witness(user, id, dto.note ?? null);
  }
}
