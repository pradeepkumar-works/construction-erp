import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { ModuleSwitch } from '../common/decorators';
import { FixedAssetsService } from './fixed-assets.service';
import { CreateFixedAssetDto, DisposeAssetDto, FixedAssetQuery, ItScheduleQuery, PrepareRunDto, TransferAssetDto, UpdateFixedAssetDto } from './fixed-assets.dto';

/** Fixed assets: the register, transfers, depreciation runs and disposals. Admin, management and accounts. */
@ApiTags('fixed-assets')
@ApiBearerAuth()
@ModuleSwitch('books')
@Controller('fixed-assets')
export class FixedAssetsController {
  constructor(private assets: FixedAssetsService) {}

  @ApiOperation({ summary: 'The register: each asset with its cost, depreciation in the books and book value, and the totals of those in use' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: FixedAssetQuery) {
    return this.assets.list(user, q);
  }

  @ApiOperation({ summary: "The register's book value beside the balance sheet's property, plant and equipment today" })
  @Get('books-check')
  booksCheck(@CurrentUser() user: RequestUser) {
    return this.assets.booksCheck(user);
  }

  @ApiOperation({ summary: 'Income Tax depreciation by block for a financial year, with half the rate on additions used under 180 days' })
  @Get('income-tax')
  itSchedule(@CurrentUser() user: RequestUser, @Query() q: ItScheduleQuery) {
    return this.assets.itSchedule(user, q);
  }

  @ApiOperation({ summary: 'Depreciation runs, newest first' })
  @Get('runs')
  listRuns(@CurrentUser() user: RequestUser) {
    return this.assets.listRuns(user);
  }

  @ApiOperation({ summary: 'Prepare a draft run for a period (a month or a year): each asset’s charge by days, and the total' })
  @Post('runs')
  prepareRun(@CurrentUser() user: RequestUser, @Body() dto: PrepareRunDto) {
    return this.assets.prepareRun(user, dto);
  }

  @ApiOperation({ summary: 'A run with its lines, and why it cannot be posted if so' })
  @Get('runs/:id')
  getRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.getRun(user, id);
  }

  @ApiOperation({ summary: 'Prepare a draft run again from the register as it is now' })
  @Post('runs/:id/refresh')
  refreshRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.refreshRun(user, id);
  }

  @ApiOperation({ summary: 'Post a draft run to the books: Dr depreciation, Cr accumulated depreciation, on its last day (refused inside the locked books)' })
  @Post('runs/:id/post')
  postRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.postRun(user, id);
  }

  @ApiOperation({ summary: 'Take a posted run back to draft (not once Tally has it, nor inside the locked books)' })
  @Post('runs/:id/undo-post')
  undoPost(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.undoPost(user, id);
  }

  @ApiOperation({ summary: 'Delete a draft run' })
  @Delete('runs/:id')
  removeRun(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.removeRun(user, id);
  }

  @ApiOperation({ summary: 'An asset with its depreciation by run and where it has been' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.get(user, id);
  }

  @ApiOperation({ summary: 'Add an asset (numbered from the FA series); with equipmentId, an owned machine becomes one, never a hired one' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFixedAssetDto) {
    return this.assets.create(user, dto);
  }

  @ApiOperation({ summary: 'Change an asset: name, papers and note any time; its cost, class, life and method until a posted run charges it' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFixedAssetDto) {
    return this.assets.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete an asset entered by mistake (never charged, not disposed, not in Tally)' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.remove(user, id);
  }

  @ApiOperation({ summary: 'Move an asset to another site or head office on a day; its machine moves with it' })
  @Post(':id/transfer')
  transfer(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferAssetDto) {
    return this.assets.transfer(user, id, dto);
  }

  @ApiOperation({ summary: 'Sell or scrap an asset: the money in, the depreciation charged off its cost, and the profit or loss' })
  @Post(':id/dispose')
  dispose(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisposeAssetDto) {
    return this.assets.dispose(user, id, dto);
  }
}
