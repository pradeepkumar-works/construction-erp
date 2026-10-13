import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StockService } from './stock.service';
import {
  CreateAdjustmentDto,
  CreateIssueDto,
  CreateItemDto,
  CreateReceiptDto,
  ListItemsQuery,
  ListStockBalancesQuery,
  ListStockEntriesQuery,
  ReceivableQuery,
  SetMinLevelDto,
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

  @ApiOperation({ summary: 'List GRNs, issues and adjustments', description: 'Paged; `q` matches entry number, project, supplier, challan, issued to, remarks, request number and items.' })
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

  @ApiOperation({ summary: 'Adjust stock (opening balance or count correction)', description: 'Approvers only. Signed quantities; a reason is required. Lines may name a new item by `itemName` + `unit`.' })
  @Post('adjustments')
  adjust(@CurrentUser() user: RequestUser, @Body() dto: CreateAdjustmentDto) {
    return this.stock.adjust(user, dto);
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
