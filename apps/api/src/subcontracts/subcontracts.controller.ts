import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WorkOrdersService } from './work-orders.service';
import { SubcontractBillsService } from './subcontract-bills.service';
import {
  CloseWorkOrderDto,
  CreateSubcontractBillDto,
  CreateWorkOrderDto,
  ListSubcontractBillsQuery,
  ListWorkOrdersQuery,
  MarginQuery,
  UpdateSubcontractBillDto,
  UpdateWorkOrderDto,
} from './subcontracts.dto';

@ApiTags('subcontracts')
@ApiBearerAuth()
@Controller()
export class SubcontractsController {
  constructor(private orders: WorkOrdersService, private bills: SubcontractBillsService) {}

  /* ---------- work orders ---------- */

  @ApiOperation({ summary: 'Work orders to subcontractors and labour contractors', description: '`open` lists approved orders that are not closed; `boqItemId` those with a line on that BOQ item.' })
  @Get('work-orders')
  list(@CurrentUser() user: RequestUser, @Query() q: ListWorkOrdersQuery) {
    return this.orders.list(user, q);
  }

  @ApiOperation({ summary: 'Client rate against subcontract rate per BOQ item', description: 'From approved work orders, weighted by quantity. Billing roles.' })
  @Get('work-orders/margin')
  margin(@CurrentUser() user: RequestUser, @Query() q: MarginQuery) {
    return this.orders.margin(user, q);
  }

  @ApiOperation({ summary: 'A work order with its bills' })
  @Get('work-orders/:id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @ApiOperation({ summary: 'Issue a work order', description: 'Numbered WO-<year>-0001. Lines are BOQ items (measured) or the order’s own items. TDS defaults from the PAN under section 194C.' })
  @Post('work-orders')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkOrderDto) {
    return this.orders.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a work order before approval' })
  @Patch('work-orders/:id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.orders.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit a work order for approval' })
  @Post('work-orders/:id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.submit(user, id);
  }

  @ApiOperation({ summary: 'Close an approved work order', description: 'No more measurements, issues or bills against it.' })
  @Post('work-orders/:id/close')
  close(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseWorkOrderDto) {
    return this.orders.close(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a work order that is not approved and has nothing recorded against it' })
  @Delete('work-orders/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(user, id);
  }

  /* ---------- subcontractor bills ---------- */

  @ApiOperation({ summary: 'Subcontractor bills' })
  @Get('subcontract-bills')
  listBills(@CurrentUser() user: RequestUser, @Query() q: ListSubcontractBillsQuery) {
    return this.bills.list(user, q);
  }

  @ApiOperation({ summary: 'A subcontractor bill with the measurements and issues it took' })
  @Get('subcontract-bills/:id')
  getBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.get(user, id);
  }

  @ApiOperation({
    summary: 'Prepare the next bill on a work order',
    description: 'Takes approved measurements of their work and material issued to them up to `measuredUpTo`; `quantities` for the order’s own items. One open bill per work order.',
  })
  @Post('subcontract-bills')
  createBill(@CurrentUser() user: RequestUser, @Body() dto: CreateSubcontractBillDto) {
    return this.bills.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit a bill before approval (re-takes measurements and issues)' })
  @Patch('subcontract-bills/:id')
  updateBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubcontractBillDto) {
    return this.bills.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit a subcontractor bill for approval' })
  @Post('subcontract-bills/:id/submit')
  submitBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.submit(user, id);
  }

  @ApiOperation({ summary: 'Delete a bill that is not approved' })
  @Delete('subcontract-bills/:id')
  removeBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.remove(user, id);
  }
}
