import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { StatementsService } from './statements.service';
import { AsOnQuery, BankAccountDto, BankImportDto, BankMatchDto, BankQuery, BankUnmatchDto, LockDto, PeriodQuery, ProfitLossQuery, SaveOpeningDto } from './statements.dto';
import { ModuleSwitch } from '../common/decorators';

/** Financial statements (v6 item 103): trial balance, profit and loss, balance sheet, bank reconciliation, year close. */
@ApiTags('statements')
@ApiBearerAuth()
@ModuleSwitch('books')
@Controller('statements')
export class StatementsController {
  constructor(private statements: StatementsService) {}

  @ApiOperation({ summary: 'Trial balance: each account’s opening, debits, credits and closing in a period (for a project)' })
  @Get('trial-balance')
  trialBalance(@CurrentUser() user: RequestUser, @Query() q: PeriodQuery) {
    return this.statements.trialBalance(user, q);
  }

  @ApiOperation({ summary: 'Each account’s movement in a period on each project' })
  @Get('trial-balance/by-project')
  trialBalanceByProject(@CurrentUser() user: RequestUser, @Query() q: PeriodQuery) {
    return this.statements.trialBalanceByProject(user, q);
  }

  @ApiOperation({ summary: 'Profit and loss in Schedule III order, with the same period a year before (and by project)' })
  @Get('profit-loss')
  profitLoss(@CurrentUser() user: RequestUser, @Query() q: ProfitLossQuery) {
    return this.statements.profitLoss(user, q);
  }

  @ApiOperation({ summary: 'Balance sheet in Schedule III order as on a day, with the same day a year before' })
  @Get('balance-sheet')
  balanceSheet(@CurrentUser() user: RequestUser, @Query() q: AsOnQuery) {
    return this.statements.balanceSheet(user, q.asOn);
  }

  @ApiOperation({ summary: 'Bank reconciliation of a bank account on a day, with its statement and bank book lines' })
  @Get('bank')
  bank(@CurrentUser() user: RequestUser, @Query() q: BankQuery) {
    return this.statements.bank(user, q);
  }

  @ApiOperation({ summary: 'Import a bank statement (its cells, as read from the bank’s CSV or Excel) and match it' })
  @Post('bank/import')
  importStatement(@CurrentUser() user: RequestUser, @Body() dto: BankImportDto) {
    return this.statements.importStatement(user, dto);
  }

  @ApiOperation({ summary: 'Match the account’s free statement lines to the bank book by amount and day' })
  @Post('bank/auto-match')
  autoMatch(@CurrentUser() user: RequestUser, @Body() dto: BankAccountDto) {
    return this.statements.autoMatch(user, dto.accountId);
  }

  @Post('bank/match')
  match(@CurrentUser() user: RequestUser, @Body() dto: BankMatchDto) {
    return this.statements.matchByHand(user, dto);
  }

  @Post('bank/unmatch')
  unmatch(@CurrentUser() user: RequestUser, @Body() dto: BankUnmatchDto) {
    return this.statements.unmatch(user, dto.statementLineId);
  }

  @Delete('bank/lines/:id')
  removeLine(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.statements.removeStatementLine(user, id);
  }

  @ApiOperation({ summary: 'The day the books begin, opening balances, the lock and each financial year' })
  @Get('year')
  year(@CurrentUser() user: RequestUser) {
    return this.statements.year(user);
  }

  @Put('opening')
  saveOpening(@CurrentUser() user: RequestUser, @Body() dto: SaveOpeningDto) {
    return this.statements.saveOpening(user, dto);
  }

  @ApiOperation({ summary: 'Lock the books up to a day (or take the lock off): nothing posts or changes on or before it' })
  @Put('lock')
  lock(@CurrentUser() user: RequestUser, @Body() dto: LockDto) {
    return this.statements.lock(user, dto);
  }

  @ApiOperation({ summary: 'Close a financial year: income and expenses to the profit and loss account, and lock it' })
  @Post('years/:code/close')
  close(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.statements.close(user, code);
  }

  @Post('years/:code/reopen')
  reopen(@CurrentUser() user: RequestUser, @Param('code') code: string) {
    return this.statements.reopen(user, code);
  }
}
