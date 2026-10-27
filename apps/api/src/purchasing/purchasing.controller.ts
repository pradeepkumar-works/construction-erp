import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { QuotationsService } from './quotations.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { VendorBillsService } from './vendor-bills.service';
import { RequestsToOrderService } from './requests-to-order.service';
import {
  ClosePurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreateQuotationDto,
  BillableJobsQuery,
  CreateVendorBillDto,
  HirePreviewQuery,
  LastRatesQuery,
  RateCheckQuery,
  ListPurchaseOrdersQuery,
  ListVendorBillsQuery,
  ProcurementStatusQuery,
  FinaliseL1Dto,
  ReceivableOrdersQuery,
  RequestsToOrderQuery,
  UpdatePurchaseOrderDto,
  UpdateQuotationDto,
  UpdateVendorBillDto,
} from './purchasing.dto';

@ApiTags('purchasing')
@ApiBearerAuth()
@Controller()
export class PurchasingController {
  constructor(private quotations: QuotationsService, private orders: PurchaseOrdersService, private bills: VendorBillsService, private toOrder: RequestsToOrderService) {}

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

  @ApiOperation({
    summary: 'The split of a request between the vendors who quoted lowest per item',
    description: 'What is still to order, at each winning vendor’s rate, with what the split saves against the cheapest single quotation.',
  })
  @Get('material-requests/:id/award-lowest')
  awardPlan(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.awardPlan(user, id);
  }

  @ApiOperation({
    summary: 'Raise a draft order on each vendor who quoted lowest per item',
    description: 'One draft purchase order per winning vendor, for what the request still needs. Procurement, project managers and management.',
  })
  @Post('material-requests/:id/award-lowest')
  awardLowest(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.awardLowest(user, id);
  }

  @ApiOperation({ summary: 'A material request as purchase works it', description: 'Its stage, L1 and L2 for what is still to order, and the supplier finalised.' })
  @Get('material-requests/:id/to-order')
  requestToOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.toOrder.get(user, id);
  }

  @ApiOperation({
    summary: 'Finalise the supplier for what is still to order (Finalise L1)',
    description: 'One quotation (a reason when it is not L1), or the lowest per item split. Procurement, project managers and management.',
  })
  @Post('material-requests/:id/finalise')
  finalise(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FinaliseL1Dto) {
    return this.toOrder.finalise(user, id, dto);
  }

  @ApiOperation({ summary: 'Undo the supplier finalised on a request, to compare the quotations again' })
  @Post('material-requests/:id/reopen-supplier')
  reopenSupplier(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.toOrder.reopen(user, id);
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

  @ApiOperation({
    summary: 'Approved material requests with something still to order, for purchase',
    description: 'Each with its stage (quotations to get, an enquiry being answered, L1 ready for its order), its L1 and L2 for what is still to order, and the count at each stage.',
  })
  @Get('purchase-orders/requests-to-order')
  requestsToOrder(@CurrentUser() user: RequestUser, @Query() q: RequestsToOrderQuery) {
    return this.toOrder.list(user, q);
  }

  @ApiOperation({ summary: 'The last approved orders of items, newest first', description: 'v5 item 95. Up to five per item (`item=name|unit`, repeated), keyed by `name|unit` in lower case.' })
  @Get('purchase-orders/last-rates')
  lastRates(@CurrentUser() user: RequestUser, @Query() q: LastRatesQuery) {
    return this.orders.lastRates(user, q);
  }

  @ApiOperation({ summary: 'What other sites paid for items in the 30 days before an order', description: 'Item 121. Approved orders of other projects, keyed by `name|unit` in lower case; the form checks its rates with `rateAboveOthers`.' })
  @Get('purchase-orders/rate-check')
  rateCheck(@CurrentUser() user: RequestUser, @Query() q: RateCheckQuery) {
    return this.orders.rateCheck(user, q);
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

  @ApiOperation({ summary: 'Email an approved purchase order to the vendor again', description: 'It is emailed on approval; this sends it again, to the email in the vendor master now. 400 says why it could not be sent.' })
  @Post('purchase-orders/:id/email')
  emailOrder(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.resendToSupplier(user, id);
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

  @ApiOperation({
    summary: 'What a hire bill for a hired machine, project and month would bill (v5 item 91)',
    description: 'Approved logs of the month not on another bill, hours or days by the rate unit, the minimum-hours top-up, diesel to recover when the owner fuels it, and any bill already made.',
  })
  @Get('vendor-bills/hire-preview')
  hirePreview(@CurrentUser() user: RequestUser, @Query() q: HirePreviewQuery) {
    return this.bills.hirePreview(user, q);
  }

  @ApiOperation({ summary: 'Closed job cards on the project (or in the yard) a workshop can bill (v5 item 91)' })
  @Get('vendor-bills/billable-jobs')
  billableJobs(@CurrentUser() user: RequestUser, @Query() q: BillableJobsQuery) {
    return this.bills.billableJobs(user, q);
  }

  @Get('vendor-bills/:id')
  getBill(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bills.get(user, id);
  }

  @ApiOperation({
    summary: 'Record a vendor invoice: against a purchase order, a hired machine\'s month, closed job cards, or other services',
    description:
      'Numbered VB-<year>-0001. A PO bill is matched against the PO and its GRNs: quantity over what is received and not on other bills, rate above the PO, a different GST rate or freight over the PO are recorded as exceptions for the approver. Due date = invoice date + the PO payment days (45 at most for micro and small enterprises). A HIRE bill takes its hire lines from the approved logs of the month (one bill per machine, project and month), a SERVICE bill links closed job cards, an OTHER bill names its cost head (v5 item 91); these are due 30 days from the invoice.',
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
