import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { RfisService } from './rfis.service';
import { CloseRfiDto, CreateRfiDto, LinkRfiDto, ListRfisQuery, RecordAnswerDto, RfiSummaryQuery, UpdateRfiDto, WithdrawRfiDto } from './rfis.dto';

@ApiTags('rfis')
@ApiBearerAuth()
@Controller('rfis')
export class RfisController {
  constructor(private rfis: RfisService) {}

  @ApiOperation({ summary: 'RFIs, newest first', description: 'Filter by project, status, priority, drawing or `overdue` (open and past the answer-by date). Anyone with access to the project.' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListRfisQuery) {
    return this.rfis.list(user, q);
  }

  @ApiOperation({ summary: 'Open, overdue and answered counts, ageing of open RFIs and the average days to answer' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: RfiSummaryQuery) {
    return this.rfis.summary(user, q.projectId);
  }

  @ApiOperation({ summary: 'One RFI' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfis.get(user, id);
  }

  @ApiOperation({
    summary: 'Raise an RFI',
    description: "Site and office engineers and approvers. The answer-by date defaults to 7 days (2 when urgent); addressed to the project's consultant or client when left out. The client's engineers and consultants on the project are told and see it in their portal. `id` makes a retried send from the phone create nothing twice.",
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateRfiDto) {
    return this.rfis.create(user, dto);
  }

  @ApiOperation({ summary: 'Change an RFI still waiting for its answer', description: 'Whoever raised it or an approver.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRfiDto) {
    return this.rfis.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Record an answer received by letter, mail or at a meeting', description: 'Site and office engineers and approvers. Replaces an earlier answer.' })
  @Post(':id/answer')
  answer(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordAnswerDto) {
    return this.rfis.recordAnswer(user, id, dto);
  }

  @ApiOperation({ summary: 'Close an answered RFI once acted on', description: 'Whoever raised it or an approver.' })
  @Post(':id/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseRfiDto) {
    return this.rfis.close(user, id, dto);
  }

  @ApiOperation({ summary: 'Withdraw an RFI no longer needed', description: 'Whoever raised it or an approver; only while it waits for an answer.' })
  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawRfiDto) {
    return this.rfis.withdraw(user, id, dto);
  }

  @ApiOperation({ summary: 'Link the variation or delay raised from the answer (null unlinks)' })
  @Put(':id/links')
  link(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkRfiDto) {
    return this.rfis.link(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an RFI raised by mistake', description: 'Whoever raised it or an approver; only before it is answered.' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rfis.remove(user, id);
  }
}
