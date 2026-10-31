import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ConsultantChecksService } from './consultant-checks.service';
import { SiteOrdersService } from './site-orders.service';
import { ListSiteOrdersQuery, RecordSiteOrderDto, SiteOrderCloseDto, SiteOrderReplyDto } from './consultant-checks.dto';

/** Staff's side of the consultant checks (item 172): the checks on a measurement, and the site order book. */
@ApiTags('consultant checks')
@ApiBearerAuth()
@Controller()
export class ConsultantChecksController {
  constructor(private checks: ConsultantChecksService, private orders: SiteOrdersService) {}

  @ApiOperation({ summary: "The client's and consultant's checks of a measurement sheet, oldest first" })
  @Get('measurements/:id/checks')
  sheetChecks(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.checks.forSheet(user, id);
  }

  @ApiOperation({ summary: "A project's site order book: waiting for compliance first, then the latest", description: 'Anyone with access to the project.' })
  @Get('site-orders')
  list(@CurrentUser() user: RequestUser, @Query() q: ListSiteOrdersQuery) {
    return this.orders.list(user, q.projectId, q.status);
  }

  @ApiOperation({ summary: 'Copy an order in from the paper book', description: 'Site staff, QA/QC, the QS and approvers. Name who wrote it; it takes the project\'s next number.' })
  @Post('site-orders')
  record(@CurrentUser() user: RequestUser, @Body() dto: RecordSiteOrderDto) {
    return this.orders.create(user, dto.projectId, dto);
  }

  @ApiOperation({ summary: 'Reply with the compliance', description: "Site staff, QA/QC, the QS and approvers. The engineer who wrote it and the project's guests are told." })
  @Post('site-orders/:id/reply')
  reply(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SiteOrderReplyDto) {
    return this.orders.reply(user, id, dto.reply);
  }

  @ApiOperation({ summary: 'Close an order copied in from the book, once the engineer has accepted the compliance there' })
  @Post('site-orders/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SiteOrderCloseDto) {
    return this.orders.close(user, id, dto.note ?? null);
  }

  @ApiOperation({ summary: 'Delete an order copied in by mistake, while it has no reply', description: 'Whoever recorded it or an approver.' })
  @Delete('site-orders/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(user, id);
  }
}
