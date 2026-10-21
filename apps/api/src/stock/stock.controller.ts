import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StockService } from './stock.service';
import {
  CheckGrnDto,
  CreateAdjustmentDto,
  CreateFuelIssueDto,
  CreateIssueDto,
  CreateItemDto,
  CreateReceiptDto,
  CreateSiteReturnDto,
  CreateTransferDto,
  CreateVendorReturnDto,
  IncomingTransfersQuery,
  ListItemsQuery,
  ListStockBalancesQuery,
  ListStockEntriesQuery,
  PostCountDto,
  ReceivableQuery,
  ReceiveTransferDto,
  SetMinLevelDto,
  StockValuationQuery,
  UpdateItemDto,
} from './stock.dto';

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private stock: StockService) {}

  @ApiOperation({ summary: 'Stock balance per project and item', description: 'Paged; `q` matches item, category and project. Received, issued and adjusted totals, minimum level and a `low` flag.' })
  @Get('balances')
  balances(@CurrentUser() user: RequestUser, @Query() q: ListStockBalancesQuery) {
    return this.stock.balances(user, q);
  }

  @ApiOperation({ summary: 'Set or clear the minimum stock of an item at a project', description: 'Store manager or approver. `minQty` null or 0 removes it. Issues that take the balance below it notify the store managers and the PM.' })
  @Put('min-levels')
  setMinLevel(@CurrentUser() user: RequestUser, @Body() dto: SetMinLevelDto) {
    return this.stock.setMinLevel(user, dto);
  }

  @ApiOperation({ summary: 'Approved material requests with quantities still to receive', description: 'For the GRN form.' })
  @Get('receivable')
  receivable(@CurrentUser() user: RequestUser, @Query() q: ReceivableQuery) {
    return this.stock.receivable(user, q);
  }

  @ApiOperation({ summary: 'List store entries', description: 'Paged; without `type` or `allTypes=true` only GRNs, issues and adjustments. `q` matches entry number, project, supplier, challan, issued to, remarks, request number and items.' })
  @Get('entries')
  list(@CurrentUser() user: RequestUser, @Query() q: ListStockEntriesQuery) {
    return this.stock.list(user, q);
  }

  @Get('entries/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.stock.get(user, id);
  }

  @ApiOperation({
    summary: 'Receive material (GRN) against an approved material request',
    description: 'Store manager, site engineer or approver. Each line may not exceed what is still pending (409). Send a client-generated `id` to make retries safe.',
  })
  @Post('receipts')
  receive(@CurrentUser() user: RequestUser, @Body() dto: CreateReceiptDto) {
    return this.stock.receive(user, dto);
  }

  @ApiOperation({ summary: 'Issue material at site', description: 'Each line may not exceed the stock at the project (409).' })
  @Post('issues')
  issue(@CurrentUser() user: RequestUser, @Body() dto: CreateIssueDto) {
    return this.stock.issue(user, dto);
  }

  @ApiOperation({
    summary: 'Fuel into a machine (v5 item 93)',
    description: 'An issue of a fuel item to one machine, with its meter reading. Same rules as an issue; the phone sends it through its outbox with its own id.',
  })
  @Post('fuel-issues')
  fuelIssue(@CurrentUser() user: RequestUser, @Body() dto: CreateFuelIssueDto) {
    return this.stock.fuelIssue(user, dto);
  }

  @ApiOperation({ summary: 'Adjust stock (opening balance or count correction)', description: 'Approvers only. Signed quantities; a reason is required. Lines may name a new item by `itemName` + `unit`.' })
  @Post('adjustments')
  adjust(@CurrentUser() user: RequestUser, @Body() dto: CreateAdjustmentDto) {
    return this.stock.adjust(user, dto);
  }

  @ApiOperation({ summary: "Send material to another project's store", description: 'Stock keepers of the sending project. It leaves stock now and is in transit until the other project receives it.' })
  @Post('transfers')
  transfer(@CurrentUser() user: RequestUser, @Body() dto: CreateTransferDto) {
    return this.stock.transfer(user, dto);
  }

  @ApiOperation({ summary: 'Transfers in transit to projects you can see' })
  @Get('transfers/incoming')
  incoming(@CurrentUser() user: RequestUser, @Query() q: IncomingTransfersQuery) {
    return this.stock.incomingTransfers(user, q);
  }

  @ApiOperation({ summary: 'Receive a transfer at the project it was sent to', description: 'Stock keepers of the receiving project. The same items and quantities come into stock; each transfer is received once (409).' })
  @Post('transfers/:id/receive')
  receiveTransfer(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveTransferDto) {
    return this.stock.receiveTransfer(user, id, dto);
  }

  @ApiOperation({ summary: 'Return material to the supplier', description: 'Each line may not exceed the stock at the project (409). A reason is required.' })
  @Post('vendor-returns')
  returnToVendor(@CurrentUser() user: RequestUser, @Body() dto: CreateVendorReturnDto) {
    return this.stock.returnToVendor(user, dto);
  }

  @ApiOperation({ summary: 'Take back unused material from site', description: 'At most what is out on site (issued less returned). It comes off the material cost.' })
  @Post('site-returns')
  returnFromSite(@CurrentUser() user: RequestUser, @Body() dto: CreateSiteReturnDto) {
    return this.stock.returnFromSite(user, dto);
  }

  @ApiOperation({ summary: 'Post a physical stock count', description: 'Approvers only. Counted quantities against the current balance; the differences become one adjustment. `entry` is the adjustment, null when every count matched.' })
  @Post('counts')
  postCount(@CurrentUser() user: RequestUser, @Body() dto: PostCountDto) {
    return this.stock.postCount(user, dto);
  }

  @ApiOperation({ summary: 'Stock valuation and ageing', description: 'Store managers, approvers and accounts. Balances at the item master rate, aged first in, first out.' })
  @Get('valuation')
  valuation(@CurrentUser() user: RequestUser, @Query() q: StockValuationQuery) {
    return this.stock.valuation(user, q);
  }

  @ApiOperation({
    summary: "QA/QC's check of a GRN: accepted, partly accepted (rejected quantity per line) or rejected",
    description: 'QA/QC or an approver. Can be recorded again to correct it. Stock is not changed; rejected material goes back with a return to vendor.',
  })
  @Post('entries/:id/qc')
  checkGrn(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CheckGrnDto) {
    return this.stock.checkGrn(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a stock entry', description: 'Approvers only. Refused (409) when material it brought in has already been issued.' })
  @Delete('entries/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.stock.remove(user, id);
  }

  @ApiOperation({ summary: 'Item master', description: 'Paged; `q` matches name, category and unit. Receipts add items from the request lines automatically.' })
  @Get('items')
  listItems(@CurrentUser() user: RequestUser, @Query() q: ListItemsQuery) {
    return this.stock.listItems(user, q);
  }

  @ApiOperation({ summary: 'Add an item', description: 'Store manager or approver.' })
  @Post('items')
  createItem(@CurrentUser() user: RequestUser, @Body() dto: CreateItemDto) {
    return this.stock.createItem(user, dto);
  }

  @ApiOperation({ summary: 'Rename an item or change its category', description: 'The unit is fixed once the item has stock movements.' })
  @Patch('items/:id')
  updateItem(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.stock.updateItem(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an item that has no stock movements' })
  @Delete('items/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.stock.removeItem(user, id);
  }
}
