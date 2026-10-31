import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { BooksService } from './books.service';
import { AccountQuery, CreateAccountDto, DayBookQuery, LedgerQuery, SaveVoucherDto, UpdateAccountDto, VoucherNoteDto, VoucherQuery, VoucherReasonDto } from './books.dto';
import { ModuleSwitch } from '../common/decorators';

/** The books of account: chart of accounts, vouchers, day book, cash and bank books, ledgers. */
@ApiTags('books')
@ApiBearerAuth()
@ModuleSwitch('books')
@Controller('books')
export class BooksController {
  constructor(private books: BooksService) {}

  @ApiOperation({ summary: 'When the modules were last posted, records that could not be, and vouchers to approve' })
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.books.status(user);
  }

  @ApiOperation({ summary: 'Post what changed in the modules now' })
  @Post('post')
  post(@CurrentUser() user: RequestUser) {
    return this.books.post(user);
  }

  @ApiOperation({ summary: 'The chart of accounts with each balance (up to a day, for a project)' })
  @Get('accounts')
  accounts(@CurrentUser() user: RequestUser, @Query() q: AccountQuery) {
    return this.books.accounts(user, q);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: RequestUser, @Body() dto: CreateAccountDto) {
    return this.books.createAccount(user, dto);
  }

  @Patch('accounts/:id')
  updateAccount(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.books.updateAccount(user, id, dto);
  }

  @Delete('accounts/:id')
  removeAccount(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.books.removeAccount(user, id);
  }

  @ApiOperation({ summary: "An account's entries with opening, running and closing balance (cash and bank books too)" })
  @Get('ledger')
  ledger(@CurrentUser() user: RequestUser, @Query() q: LedgerQuery) {
    return this.books.ledger(user, q);
  }

  @ApiOperation({ summary: 'Every approved voucher in a period, with its lines' })
  @Get('day-book')
  dayBook(@CurrentUser() user: RequestUser, @Query() q: DayBookQuery) {
    return this.books.dayBook(user, q);
  }

  @ApiOperation({ summary: 'Vouchers made by hand, in every state' })
  @Get('vouchers')
  vouchers(@CurrentUser() user: RequestUser, @Query() q: VoucherQuery) {
    return this.books.vouchers(user, q);
  }

  @Get('vouchers/:id')
  voucher(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.books.voucher(user, id);
  }

  @ApiOperation({ summary: 'Make a journal, payment, receipt or contra voucher (a draft)' })
  @Post('vouchers')
  createVoucher(@CurrentUser() user: RequestUser, @Body() dto: SaveVoucherDto) {
    return this.books.createVoucher(user, dto);
  }

  @Put('vouchers/:id')
  updateVoucher(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SaveVoucherDto) {
    return this.books.updateVoucher(user, id, dto);
  }

  @Delete('vouchers/:id')
  removeVoucher(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.books.removeVoucher(user, id);
  }

  @Post('vouchers/:id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.books.submit(user, id);
  }

  @Post('vouchers/:id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: VoucherNoteDto) {
    return this.books.approve(user, id, dto.note);
  }

  @Post('vouchers/:id/reject')
  reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: VoucherReasonDto) {
    return this.books.reject(user, id, dto.note);
  }

  @Post('vouchers/:id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: VoucherReasonDto) {
    return this.books.cancel(user, id, dto.note);
  }
}
