import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QuotationsService } from './quotations.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { VendorBillsService } from './vendor-bills.service';
import {
  ClosePurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreateQuotationDto,
  CreateVendorBillDto,
  ListPurchaseOrdersQuery,
  ListVendorBillsQuery,
  ProcurementStatusQuery,
  ReceivableOrdersQuery,
  UpdatePurchaseOrderDto,
  UpdateQuotationDto,
  UpdateVendorBillDto,
} from './purchasing.dto';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller()
export class PurchasingController {
  constructor(private quotations: QuotationsService, private orders: PurchaseOrdersService, private bills: VendorBillsService) {}

  /* ---------- quotations ---------- */

  @ApiOperation({ summary: 'Quotations entered against a material request' })
  @Get('material-requests/:id/quotations')
  listQuotations(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.list(user, id);
  }

  @ApiOperation({ summary: 'Comparative statement of the quotations on a material request', description: 'Each line with every vendor’s rate, the lowest landed rate per line and the lowest complete quotation.' })
  @Get('material-requests/:id/comparative')
  comparative(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.comparative(user, id);
  }

  @ApiOperation({ summary: 'Enter a vendor quotation', description: 'Against an approved material request, one per vendor. Procurement, project managers and management.' })
  @Post('quotations')
  createQuotation(@CurrentUser() user: RequestUser, @Body() dto: CreateQuotationDto) {
    return this.quotations.create(user, dto);
  }

  @Get('quotations/:id')
  getQuotation(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.get(user, id);
  }

  @Patch('quotations/:id')
  updateQuotation(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotations.update(user, id, dto);
  }

  @Delete('quotations/:id')
  removeQuotation(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.remove(user, id);
  }

  /* ---------- purchase orders ---------- */

  @Get('purchase-orders')
  listOrders(@CurrentUser() user: RequestUser, @Query() q: ListPurchaseOrdersQuery) {
    return this.orders.list(user, q);
  }

  @ApiOperation({ summary: 'Approved, open purchase orders with quantities still to receive', description: 'For the GRN form.' })
  @Get('purchase-orders/receivable')
  receivable(@CurrentUser() user: RequestUser, @Query() q: ReceivableOrdersQuery) {
    return this.orders.receivable(user, q);
  }

  @ApiOperation({
    summary: 'Procurement status: approved orders, received and still to come, late deliveries first',
    description: 'With totals and a line per vendor with orders pending. `show`: PENDING (default), LATE or ALL.',
  })
  @Get('purchase-orders/status')
  status(@CurrentUser() user: RequestUser, @Query() q: ProcurementStatusQuery) {
    return this.orders.status(user, q);
  }

  @Get('purchase-orders/:id')
  getOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @ApiOperation({
    summary: 'Raise a purchase order',
    description:
      'Numbered PO-<year>-0001. Lines from the material request may order at most what it still needs. Saved as a draft unless `submit: true`. Approval writes each line rate to the item master.',
  })
  @Post('purchase-orders')
  createOrder(@CurrentUser() user: RequestUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.orders.create(user, dto);
  }

  @Patch('purchase-orders/:id')
  updateOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.orders.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a purchase order for approval' })
  @Post('purchase-orders/:id/submit')
  submitOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.submit(user, id);
  }

  @ApiOperation({ summary: 'Close an approved purchase order short', description: 'No more GRNs against it; the balance is free to order again. Received material can still be billed.' })
  @Post('purchase-orders/:id/close')
  closeOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClosePurchaseOrderDto) {
    return this.orders.close(user, id, dto);
  }

  @Delete('purchase-orders/:id')
  removeOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(user, id);
  }

  /* ---------- vendor bills ---------- */

  @Get('vendor-bills')
  listBills(@CurrentUser() user: RequestUser, @Query() q: ListVendorBillsQuery) {
    return this.bills.list(user, q);
  }

  @Get('vendor-bills/:id')
  getBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.get(user, id);
  }

  @ApiOperation({
    summary: 'Record a vendor invoice against a purchase order',
    description:
      'Numbered VB-<year>-0001. Matched against the PO and its GRNs: quantity over what is received and not on other bills, rate above the PO, a different GST rate or freight over the PO are recorded as exceptions for the approver. Due date = invoice date + the PO payment days (45 at most for micro and small enterprises).',
  })
  @Post('vendor-bills')
  createBill(@CurrentUser() user: RequestUser, @Body() dto: CreateVendorBillDto) {
    return this.bills.create(user, dto);
  }

  @Patch('vendor-bills/:id')
  updateBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorBillDto) {
    return this.bills.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit a vendor bill for approval', description: 'The match is run again first.' })
  @Post('vendor-bills/:id/submit')
  submitBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.submit(user, id);
  }

  @Delete('vendor-bills/:id')
  removeBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.remove(user, id);
  }
}
