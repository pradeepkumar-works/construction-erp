import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ReceivablesService } from './receivables.service';
import { CreateReceiptDto, ListReceiptsQuery, ReceivablesQuery, UpdateReceiptDto } from './receivables.dto';

@ApiTags('receivables')
@ApiBearerAuth()
@Controller()
export class ReceivablesController {
  constructor(private receivables: ReceivablesService) {}

  @ApiOperation({
    summary: 'Receivables as of today',
    description: 'Billed, received, deducted and outstanding per project and client, outstanding aged from the day each bill was sent, retention and deposit held, and the open bills.',
  })
  @Get('receivables')
  summary(@CurrentUser() user: RequestUser, @Query() q: ReceivablesQuery) {
    return this.receivables.summary(user, q);
  }

  @ApiOperation({ summary: 'Receipts from clients (paged)' })
  @Get('receipts')
  list(@CurrentUser() user: RequestUser, @Query() q: ListReceiptsQuery) {
    return this.receivables.list(user, q);
  }

  @Get('receipts/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.receivables.get(user, id);
  }

  @ApiOperation({
    summary: 'Record money received',
    description:
      'Kind BILL: a payment against a sent bill, with the deductions the client made; the bill becomes paid once received plus deducted covers work + GST. ' +
      'RETENTION_RELEASE / DEPOSIT_RELEASE: retention or security deposit the client held on the project, paid back. Admin, management and accounts.',
  })
  @Post('receipts')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReceiptDto) {
    return this.receivables.create(user, dto);
  }

  @Patch('receipts/:id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateReceiptDto) {
    return this.receivables.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Take off a receipt entered by mistake' })
  @Delete('receipts/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.receivables.remove(user, id);
  }
}
