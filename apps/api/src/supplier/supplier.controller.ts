import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SupplierAllowed, SupplierOnly } from '../common/decorators';
import { PublicQuoteDto } from '../enquiries/enquiries.dto';
import { SupplierService } from './supplier.service';
import { AcceptOrderDto, ChangeQuery, CreateDispatchDto, CreateSupplierInvoiceDto, DecideChangeDto, InviteSupplierDto, InvoiceInboxQuery, ReturnInvoiceDto, SetLoginActiveDto, StatementQuery, SupplierChangeInput } from './supplier.dto';

const kindOf = (k: string) => (k === 'wo' ? 'WO' : 'PO') as 'PO' | 'WO';

/** The supplier portal: a supplier's own login, acting for its vendor. Staff are refused. */
@ApiTags('supplier portal')
@ApiBearerAuth()
@SupplierAllowed()
@SupplierOnly()
@Controller('supplier')
export class SupplierController {
  constructor(private supplier: SupplierService) {}

  @ApiOperation({ summary: 'What waits on the supplier: enquiries, orders to accept, invoices, what is due to them' })
  @Get('home')
  home(@CurrentUser() user: RequestUser) {
    return this.supplier.home(user);
  }

  @ApiOperation({ summary: 'Enquiries sent to the vendor, newest first' })
  @Get('enquiries')
  enquiries(@CurrentUser() user: RequestUser) {
    return this.supplier.enquiryList(user);
  }

  @ApiOperation({ summary: 'Quote on an enquiry (once), as through its link' })
  @Post('enquiries/:id/quote')
  quote(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PublicQuoteDto) {
    return this.supplier.quote(user, id, dto);
  }

  @ApiOperation({ summary: "The vendor's approved purchase and work orders, newest first, with what is still to send" })
  @Get('orders')
  orders(@CurrentUser() user: RequestUser) {
    return this.supplier.orders(user);
  }

  @ApiOperation({ summary: 'One order; kind is po or wo' })
  @Get('orders/:kind/:id')
  order(@CurrentUser() user: RequestUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplier.order(user, kindOf(kind), id);
  }

  @ApiOperation({ summary: 'Accept an order, with a remark' })
  @Post('orders/:kind/:id/accept')
  accept(@CurrentUser() user: RequestUser, @Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptOrderDto) {
    return this.supplier.accept(user, kindOf(kind), id, dto);
  }

  @ApiOperation({ summary: 'Dispatch notes sent, newest first' })
  @Get('dispatches')
  dispatches(@CurrentUser() user: RequestUser) {
    return this.supplier.dispatches(user);
  }

  @ApiOperation({ summary: 'Send a dispatch note against a purchase order', description: 'No more than is still to send on each line. The site fills its GRN from it.' })
  @Post('dispatches')
  createDispatch(@CurrentUser() user: RequestUser, @Body() dto: CreateDispatchDto) {
    return this.supplier.createDispatch(user, dto);
  }

  @ApiOperation({ summary: 'Cancel a dispatch note the site has not received' })
  @Post('dispatches/:id/cancel')
  cancelDispatch(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplier.cancelDispatch(user, id);
  }

  @ApiOperation({ summary: 'Invoices sent, newest first, with the bill made from each' })
  @Get('invoices')
  invoices(@CurrentUser() user: RequestUser) {
    return this.supplier.invoices(user);
  }

  @ApiOperation({ summary: 'Send an invoice (upload the file first)', description: 'A returned or withdrawn invoice is sent again with the same number.' })
  @Post('invoices')
  createInvoice(@CurrentUser() user: RequestUser, @Body() dto: CreateSupplierInvoiceDto) {
    return this.supplier.createInvoice(user, dto);
  }

  @ApiOperation({ summary: 'Withdraw an invoice accounts have not billed' })
  @Post('invoices/:id/withdraw')
  withdraw(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplier.withdrawInvoice(user, id);
  }

  @ApiOperation({ summary: 'Bills, payments and debit notes with the balance after each, and the bills with what is due' })
  @Get('statement')
  statement(@CurrentUser() user: RequestUser, @Query() q: StatementQuery) {
    return this.supplier.statement(user, q);
  }

  @ApiOperation({ summary: "The vendor's details (bank account masked) and the changes asked for" })
  @Get('profile')
  profile(@CurrentUser() user: RequestUser) {
    return this.supplier.profile(user);
  }

  @ApiOperation({ summary: 'Ask for details to change; nothing changes until the company approves it' })
  @Post('profile/changes')
  requestChange(@CurrentUser() user: RequestUser, @Body() dto: SupplierChangeInput) {
    return this.supplier.requestChange(user, dto);
  }
}

/** The company's side of the supplier portal: logins on a vendor, the invoice inbox and profile changes. */
@ApiTags('supplier portal')
@ApiBearerAuth()
@Controller('supplier-portal')
export class SupplierPortalController {
  constructor(private supplier: SupplierService) {}

  @ApiOperation({ summary: "A vendor's portal logins and the changes they asked for" })
  @Get('vendors/:id')
  vendor(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplier.vendorPortal(user, id);
  }

  @ApiOperation({ summary: "Give one of the vendor's people a login (an invite link)" })
  @Post('vendors/:id/logins')
  invite(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteSupplierDto, @Headers('origin') origin?: string) {
    return this.supplier.invite(user, id, dto, origin);
  }

  @ApiOperation({ summary: 'Switch a login off or on' })
  @Patch('vendors/:id/logins/:loginId')
  setActive(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('loginId', ParseUUIDPipe) loginId: string, @Body() dto: SetLoginActiveDto) {
    return this.supplier.setLoginActive(user, id, loginId, dto.isActive);
  }

  @ApiOperation({ summary: 'A new invite (or password) link for a login' })
  @Post('vendors/:id/logins/:loginId/link')
  link(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('loginId', ParseUUIDPipe) loginId: string, @Headers('origin') origin?: string) {
    return this.supplier.loginLink(user, id, loginId, origin);
  }

  @ApiOperation({ summary: "Suppliers' invoices: those with accounts unless `stage` or `all`" })
  @Get('invoices')
  inbox(@CurrentUser() user: RequestUser, @Query() q: InvoiceInboxQuery) {
    return this.supplier.invoiceInbox(user, q);
  }

  @ApiOperation({ summary: "One supplier's invoice" })
  @Get('invoices/:id')
  invoice(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.supplier.inboxInvoice(user, id);
  }

  @ApiOperation({ summary: 'Return an invoice to the supplier with what to fix' })
  @Post('invoices/:id/return')
  returnInvoice(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnInvoiceDto) {
    return this.supplier.returnInvoice(user, id, dto);
  }

  @ApiOperation({ summary: 'Changes suppliers asked for (waiting ones unless `status`)' })
  @Get('changes')
  changes(@CurrentUser() user: RequestUser, @Query() q: ChangeQuery) {
    return this.supplier.changeList(user, q.status);
  }

  @ApiOperation({ summary: "Approve a supplier's change (the vendor is updated) or turn it down" })
  @Post('changes/:id/decide')
  decide(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideChangeDto) {
    return this.supplier.decideChange(user, id, dto);
  }
}
