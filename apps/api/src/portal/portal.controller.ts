import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { GuestAllowed, GuestOnly } from '../common/decorators';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { CertifyBillDto } from '../ra-bills/ra-bills.dto';
import { InspectionsService } from '../inspections/inspections.service';
import { ReportsService } from '../reports/reports.service';
import { PortalService } from './portal.service';
import { RfisService } from '../rfis/rfis.service';
import { PortalAnswerDto } from '../rfis/rfis.dto';
import { ConsultantChecksService } from '../consultant-checks/consultant-checks.service';
import { SiteOrdersService } from '../consultant-checks/site-orders.service';
import { CheckMeasurementDto, CountersignDto, SignHiddenDto, SiteOrderCloseDto, SiteOrderInputDto, SiteOrderReopenDto } from '../consultant-checks/consultant-checks.dto';
import { PortalDprQuery, PortalReportQuery, WitnessDto } from './portal.dto';

/** The client portal: the only routes the client's engineer and consultant (guest roles) may call, besides their account. Staff use the full screens. */
@ApiTags('portal')
@ApiBearerAuth()
@GuestAllowed()
@GuestOnly()
@Controller('portal')
export class PortalController {
  constructor(private portal: PortalService, private bills: RaBillsService, private inspections: InspectionsService, private reports: ReportsService, private rfis: RfisService, private checks: ConsultantChecksService, private orders: SiteOrdersService) {}

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

  @ApiOperation({ summary: 'RFIs we raised on the project: waiting for an answer first, then the latest' })
  @Get('projects/:id/rfis')
  projectRfis(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfis.listForClient(user, id);
  }

  @ApiOperation({ summary: "Answer an RFI (client's engineer or consultant); whoever raised it and the project manager are told" })
  @Post('rfis/:id/answer')
  answerRfi(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PortalAnswerDto) {
    return this.rfis.answerAsClient(user, id, dto.answer);
  }

  /* ---------- Consultant checks (item 172) ---------- */

  @ApiOperation({ summary: "The contractor's approved measurement sheets, with the checks on them and each level's share checked" })
  @Get('projects/:id/measurements')
  projectMeasurements(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.forPortal(user, id);
  }

  @ApiOperation({ summary: 'Check a measurement sheet at your level on the project: your own quantity against the recorded one', description: 'Checking again replaces your earlier check. A difference tells the QS.' })
  @Post('measurements/:id/check')
  checkMeasurement(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckMeasurementDto) {
    return this.checks.check(user, id, dto);
  }

  @ApiOperation({ summary: "A bill's measurements as checked: each level's share, your next sheets, and whether you may certify yet" })
  @Get('bills/:id/checks')
  billChecks(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.billChecksForClient(user, id);
  }

  @ApiOperation({ summary: 'Sign off hidden work before it is covered, against its inspection, at your level', description: 'Signing again before the countersign replaces it.' })
  @Post('inspections/:id/hidden-sign')
  signHidden(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignHiddenDto) {
    return this.inspections.signHidden(user, id, dto);
  }

  @ApiOperation({ summary: "Countersign a hidden-work sign-off: the client's engineer, or a consultant above whoever signed" })
  @Post('inspections/:id/hidden-countersign')
  countersignHidden(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CountersignDto) {
    return this.inspections.countersignHidden(user, id, dto.note ?? null);
  }

  @ApiOperation({ summary: "The project's site order book: waiting for compliance first, then the latest" })
  @Get('projects/:id/site-orders')
  siteOrders(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.list(user, id);
  }

  @ApiOperation({ summary: 'Write an order in the site order book; the site is told to reply with its compliance' })
  @Post('projects/:id/site-orders')
  writeSiteOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SiteOrderInputDto) {
    return this.orders.create(user, id, dto);
  }

  @ApiOperation({ summary: "Accept the site's compliance and close the order" })
  @Post('site-orders/:id/close')
  closeSiteOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SiteOrderCloseDto) {
    return this.orders.close(user, id, dto.note ?? null);
  }

  @ApiOperation({ summary: 'Send the compliance back: the order opens again with your note' })
  @Post('site-orders/:id/reopen')
  reopenSiteOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SiteOrderReopenDto) {
    return this.orders.reopen(user, id, dto.note);
  }
}
