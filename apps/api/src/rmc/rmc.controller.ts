import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { RmcService } from './rmc.service';
import {
  CreateMixDesignDto,
  CreateRmcInvoiceDto,
  CreateRmcOrderDto,
  CreateRmcReceiptDto,
  DeliverBatchDto,
  DispatchBatchDto,
  MixDesignQuery,
  NoteDto,
  RejectBatchDto,
  RmcBatchQuery,
  RmcDayQuery,
  RmcInvoiceQuery,
  RmcOrderQuery,
  RmcReceiptQuery,
  UpdateMixDesignDto,
  UpdateRmcOrderDto,
} from './rmc.dto';
import { ModuleSwitch } from '../common/decorators';

/** Ready-mix concrete (v6 item 104): plants, mix designs, orders, batches and challans, the plant's day, bills and money received. */
@ApiTags('rmc')
@ApiBearerAuth()
@ModuleSwitch('rmc')
@Controller('rmc')
export class RmcController {
  constructor(private rmc: RmcService) {}

  @ApiOperation({ summary: 'The RMC plants the caller sees (projects of type PLANT)' })
  @Get('plants')
  plants(@CurrentUser() user: RequestUser) {
    return this.rmc.plants(user);
  }

  @ApiOperation({ summary: 'The plant’s day: orders to pour, trucks sent, by grade, and materials against stock' })
  @Get('day')
  day(@CurrentUser() user: RequestUser, @Query() q: RmcDayQuery) {
    return this.rmc.day(user, q);
  }

  @ApiOperation({ summary: 'Mix designs at the plants the caller sees' })
  @Get('mix-designs')
  mixDesigns(@CurrentUser() user: RequestUser, @Query() q: MixDesignQuery) {
    return this.rmc.mixDesigns(user, q);
  }

  @ApiOperation({ summary: 'Make a mix design (waits for quality’s approval)' })
  @Post('mix-designs')
  createMixDesign(@CurrentUser() user: RequestUser, @Body() dto: CreateMixDesignDto) {
    return this.rmc.createMixDesign(user, dto);
  }

  @ApiOperation({ summary: 'Change a mix design waiting for approval' })
  @Patch('mix-designs/:id')
  updateMixDesign(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMixDesignDto) {
    return this.rmc.updateMixDesign(user, id, dto);
  }

  @ApiOperation({ summary: 'Approve a mix design (quality, management)' })
  @Post('mix-designs/:id/approve')
  approveMixDesign(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.approveMixDesign(user, id);
  }

  @ApiOperation({ summary: 'Retire a mix design no open order uses' })
  @Post('mix-designs/:id/retire')
  retireMixDesign(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.retireMixDesign(user, id);
  }

  @ApiOperation({ summary: 'Quotes and orders' })
  @Get('orders')
  orders(@CurrentUser() user: RequestUser, @Query() q: RmcOrderQuery) {
    return this.rmc.orders(user, q);
  }

  @Get('orders/:id')
  order(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.order(user, id);
  }

  @ApiOperation({ summary: 'Quote a customer (or an own site)' })
  @Post('orders')
  createOrder(@CurrentUser() user: RequestUser, @Body() dto: CreateRmcOrderDto) {
    return this.rmc.createOrder(user, dto);
  }

  @Patch('orders/:id')
  updateOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRmcOrderDto) {
    return this.rmc.updateOrder(user, id, dto);
  }

  @ApiOperation({ summary: 'The customer accepted the quote: it becomes an order the plant can dispatch' })
  @Post('orders/:id/confirm')
  confirmOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.confirmOrder(user, id);
  }

  @Post('orders/:id/close')
  closeOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.closeOrder(user, id);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.rmc.cancelOrder(user, id, dto.note);
  }

  @ApiOperation({ summary: 'Batches and their delivery challans' })
  @Get('batches')
  batches(@CurrentUser() user: RequestUser, @Query() q: RmcBatchQuery) {
    return this.rmc.batches(user, q);
  }

  @Get('batches/:id')
  batch(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.batch(user, id);
  }

  @ApiOperation({ summary: 'Dispatch a truck: the batch and its challan, issuing the materials from the plant’s stock' })
  @Post('batches')
  dispatch(@CurrentUser() user: RequestUser, @Body() dto: DispatchBatchDto) {
    return this.rmc.dispatch(user, dto);
  }

  @Post('batches/:id/deliver')
  deliver(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverBatchDto) {
    return this.rmc.deliver(user, id, dto);
  }

  @ApiOperation({ summary: 'The site turned the truck back' })
  @Post('batches/:id/reject')
  reject(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectBatchDto) {
    return this.rmc.reject(user, id, dto);
  }

  @ApiOperation({ summary: 'Cubes cast from the truck: a concrete cube test at the grade’s strength' })
  @Post('batches/:id/cubes')
  takeCubes(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.takeCubes(user, id);
  }

  @ApiOperation({ summary: 'Bills to RMC customers' })
  @Get('invoices')
  invoices(@CurrentUser() user: RequestUser, @Query() q: RmcInvoiceQuery) {
    return this.rmc.invoices(user, q);
  }

  @Get('invoices/:id')
  invoice(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.rmc.invoice(user, id);
  }

  @ApiOperation({ summary: 'Bill an order’s delivered challans, with GST' })
  @Post('invoices')
  createInvoice(@CurrentUser() user: RequestUser, @Body() dto: CreateRmcInvoiceDto) {
    return this.rmc.createInvoice(user, dto);
  }

  @Post('invoices/:id/cancel')
  cancelInvoice(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.rmc.cancelInvoice(user, id, dto.note);
  }

  @ApiOperation({ summary: 'Money RMC customers paid' })
  @Get('receipts')
  receipts(@CurrentUser() user: RequestUser, @Query() q: RmcReceiptQuery) {
    return this.rmc.receipts(user, q);
  }

  @Post('receipts')
  createReceipt(@CurrentUser() user: RequestUser, @Body() dto: CreateRmcReceiptDto) {
    return this.rmc.createReceipt(user, dto);
  }
}
