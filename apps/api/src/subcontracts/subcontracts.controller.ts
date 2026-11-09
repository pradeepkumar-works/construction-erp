import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { WorkOrdersService } from './work-orders.service';
import { SubcontractBillsService } from './subcontract-bills.service';
import { WorkOrderAmendmentsService } from './work-order-amendments.service';
import {
  CloseWorkOrderDto,
  CreateSubcontractBillDto,
  CreateWoAmendmentDto,
  CreateWorkOrderDto,
  ListSubcontractBillsQuery,
  ListWorkOrdersQuery,
  MarginQuery,
  UpdateSubcontractBillDto,
  UpdateWoAmendmentDto,
  UpdateWorkOrderDto,
} from './subcontracts.dto';

@ApiTags('subcontracts')
@ApiBearerAuth()
@Controller()
export class SubcontractsController {
  constructor(private orders: WorkOrdersService, private bills: SubcontractBillsService, private amendments: WorkOrderAmendmentsService) {}

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

  @ApiOperation({ summary: "A work order's amendments, oldest first, each with its lines before and after" })
  @Get('work-orders/:id/amendments')
  listAmendments(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amendments.forOrder(user, id);
  }

  @ApiOperation({
    summary: 'Raise an amendment on an approved work order',
    description: 'A draft on the order’s lines as they are, numbered after the last one. One open amendment per order; not on a closed order or after its final bill is approved.',
  })
  @Post('work-orders/:id/amendments')
  createAmendment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateWoAmendmentDto) {
    return this.amendments.create(user, id, dto);
  }

  @ApiOperation({ summary: 'A work order amendment', description: 'Approved through POST /approvals/wo_amendment/:id/review, then written to the order’s lines.' })
  @Get('work-order-amendments/:id')
  getAmendment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amendments.get(user, id);
  }

  @ApiOperation({ summary: 'Change an amendment before approval', description: 'Quantities not below what is billed or measured, rates above zero, new items not already on the order.' })
  @Patch('work-order-amendments/:id')
  updateAmendment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWoAmendmentDto) {
    return this.amendments.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit an amendment for approval', description: 'The approval matrix reads the order’s value after it.' })
  @Post('work-order-amendments/:id/submit')
  submitAmendment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amendments.submit(user, id);
  }

  @ApiOperation({ summary: 'Delete an amendment that is not decided' })
  @Delete('work-order-amendments/:id')
  removeAmendment(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.amendments.remove(user, id);
  }

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
