import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { SorService } from './sor.service';
import { TendersService } from './tenders.service';
import {
  CreateTenderDto,
  CreateTenderItemDto,
  EmdReturnedDto,
  MakeProjectDto,
  SorBookInput,
  SorImportDto,
  SorItemQuery,
  SubmitTenderDto,
  TenderBidInput,
  TenderItemImportDto,
  TenderItemInput,
  TenderLibraryDto,
  TenderLinesDto,
  TenderQuery,
  TenderStatusDto,
  UpdateSorBookDto,
  UpdateSorItemDto,
  UpdateTenderDto,
} from './tenders.dto';
import { ModuleSwitch } from '../common/decorators';

/** Schedules of rates (v6 item 110): the books a bid is priced against, imported from Excel. */
@ApiTags('tenders')
@ApiBearerAuth()
@ModuleSwitch('tenders')
@Controller()
export class SorController {
  constructor(private sor: SorService) {}

  @ApiOperation({ summary: 'The schedules of rates: state SORs, the CPWD DSR and own rates' })
  @Get('sor-books')
  books(@CurrentUser() user: RequestUser) {
    return this.sor.books(user);
  }

  @ApiOperation({ summary: 'Add a schedule of rates' })
  @Post('sor-books')
  createBook(@CurrentUser() user: RequestUser, @Body() dto: SorBookInput) {
    return this.sor.createBook(user, dto);
  }

  @ApiOperation({ summary: 'Rename or describe a schedule of rates' })
  @Patch('sor-books/:id')
  updateBook(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSorBookDto) {
    return this.sor.updateBook(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a schedule no tender is priced against, with its items' })
  @Delete('sor-books/:id')
  removeBook(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sor.removeBook(user, id);
  }

  @ApiOperation({ summary: 'Import rows from Excel into a schedule', description: 'A code not in the schedule is added; a known code is updated.' })
  @Post('sor-books/:id/import')
  importRows(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SorImportDto) {
    return this.sor.importRows(user, id, dto);
  }

  @ApiOperation({ summary: 'SOR items, by schedule and by words in the code, description or chapter' })
  @Get('sor-items')
  items(@CurrentUser() user: RequestUser, @Query() q: SorItemQuery) {
    return this.sor.items(user, q);
  }

  @ApiOperation({ summary: 'Change an SOR item' })
  @Patch('sor-items/:id')
  updateItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSorItemDto) {
    return this.sor.updateItem(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an SOR item (a bid that used it keeps its rate)' })
  @Delete('sor-items/:id')
  removeItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sor.removeItem(user, id);
  }
}

/** Tender bidding (v6 item 110): the register, the priced bid BOQ, the bids at opening, the result and the project. */
@ApiTags('tenders')
@ApiBearerAuth()
@ModuleSwitch('tenders')
@Controller('tenders')
export class TendersController {
  constructor(private tenders: TendersService) {}

  @ApiOperation({ summary: 'The tender register: open tenders (soonest due first), closed ones, or one status, with the year’s figures' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: TenderQuery) {
    return this.tenders.list(user, q);
  }

  @ApiOperation({ summary: 'A tender with its priced bid BOQ, totals against the SOR and the bids ranked' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenders.get(user, id);
  }

  @ApiOperation({ summary: 'Record a tender; an EMD with its reference goes to the guarantees' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTenderDto) {
    return this.tenders.create(user, dto);
  }

  @ApiOperation({ summary: 'Change a tender: its pricing only while preparing, the rest any time' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenderDto) {
    return this.tenders.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a tender while preparing, or one not bid or cancelled' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenders.remove(user, id);
  }

  @ApiOperation({ summary: 'Import the bid BOQ from Excel, matched to the schedule of rates by SOR code' })
  @Post(':id/items/import')
  importItems(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TenderItemImportDto) {
    return this.tenders.importItems(user, id, dto);
  }

  @ApiOperation({ summary: 'Add a bid item, from the schedule of rates or by hand' })
  @Post(':id/items')
  addItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTenderItemDto) {
    return this.tenders.addItem(user, id, dto);
  }

  @ApiOperation({ summary: 'Fill the rate analysis of every item without one that the starter library knows' })
  @Post(':id/library')
  fillAll(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenders.fillAllFromLibrary(user, id);
  }

  @ApiOperation({ summary: 'Change a bid item: quantity, SOR item or rate, or the rate quoted on an item-rate tender' })
  @Patch(':id/items/:itemId')
  updateItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: TenderItemInput) {
    return this.tenders.updateItem(user, id, itemId, dto);
  }

  @ApiOperation({ summary: 'Remove a bid item' })
  @Delete(':id/items/:itemId')
  removeItem(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.tenders.removeItem(user, id, itemId);
  }

  @ApiOperation({ summary: 'Set a bid item’s rate analysis', description: 'A line without a rate takes the store item’s, the labour rate of its trade or the machines’ rate of its category.' })
  @Put(':id/items/:itemId/lines')
  setLines(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: TenderLinesDto) {
    return this.tenders.setLines(user, id, itemId, dto);
  }

  @ApiOperation({ summary: 'Fill a bid item’s rate analysis from the starter library' })
  @Post(':id/items/:itemId/library')
  fillOne(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: TenderLibraryDto) {
    return this.tenders.fillFromLibrary(user, id, itemId, dto);
  }

  @ApiOperation({ summary: 'Record the bid as submitted: its pricing is then fixed' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitTenderDto) {
    return this.tenders.submit(user, id, dto);
  }

  @ApiOperation({ summary: 'Record the result, not bidding or a cancellation, or step back one status to correct it' })
  @Post(':id/status')
  setStatus(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TenderStatusDto) {
    return this.tenders.setStatus(user, id, dto);
  }

  @ApiOperation({ summary: 'Record another bidder’s price read out at opening' })
  @Post(':id/bids')
  addBid(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TenderBidInput) {
    return this.tenders.addBid(user, id, dto);
  }

  @ApiOperation({ summary: 'Remove another bidder’s price' })
  @Delete(':id/bids/:bidId')
  removeBid(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Param('bidId', ParseUUIDPipe) bidId: string) {
    return this.tenders.removeBid(user, id, bidId);
  }

  @ApiOperation({ summary: 'Record the EMD of a tender not won as returned' })
  @Post(':id/emd-returned')
  emdReturned(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EmdReturnedDto) {
    return this.tenders.emdReturned(user, id, dto);
  }

  @ApiOperation({ summary: 'Turn a won tender into a project with its BOQ, rate analysis, budget and guarantees' })
  @Post(':id/project')
  makeProject(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MakeProjectDto) {
    return this.tenders.makeProject(user, id, dto);
  }
}
