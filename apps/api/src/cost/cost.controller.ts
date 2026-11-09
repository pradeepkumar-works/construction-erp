import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CostService } from './cost.service';
import { BudgetService } from './budget.service';
import { CashFlowService } from './cash-flow.service';
import { CashFlowQuery, CostQuery, DecideBudgetDto, EarnedValueQuery, SaveBudgetVersionDto, SetLabourRatesDto, SetOpeningDto } from './cost.dto';
import { OpeningService } from './opening.service';
import { EarnedValueService } from './earned-value.service';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('cost')
@ApiBearerAuth()
@Controller('cost')
export class CostController {
  constructor(
    private cost: CostService,
    private budget: BudgetService,
    private cashFlow: CashFlowService,
    private earnedValue: EarnedValueService,
    private opening: OpeningService,
  ) {}

  @ApiOperation({
    summary: "One project's opening cost: what it had spent by head, and done, on the day it came on Nirmaan",
    description: 'Approvers and accounts. `missing` is true when the project started more than 30 days before it was entered and has none.',
  })
  @Get('projects/:id/opening')
  getOpening(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.opening.get(user, id);
  }

  @ApiOperation({ summary: "Record a project's opening cost", description: 'Admin, management or the project manager. Cost to date counts it from its date.' })
  @Put('projects/:id/opening')
  setOpening(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetOpeningDto) {
    return this.opening.set(user, id, dto);
  }

  @ApiOperation({ summary: "Remove a project's opening cost", description: 'Admin, management or the project manager.' })
  @Delete('projects/:id/opening')
  removeOpening(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.opening.remove(user, id);
  }

  @ApiOperation({
    summary: 'Cash-flow forecast by month (six) or week (twelve)',
    description:
      'Approvers and accounts. In: unpaid RA bills (due the client payment days after sending), retention and deposit releases, and work still to bill spread to completion. Out: unpaid vendor and subcontractor bills by due date, and the forecast to complete spread to completion. Overdue amounts fall in the first period.',
  })
  @Get('cash-flow')
  forecast(@CurrentUser() user: RequestUser, @Query() q: CashFlowQuery) {
    return this.cashFlow.forecast(user, q);
  }

  @ApiOperation({ summary: "One project's budget by cost head and BOQ item, against actual cost, with the forecast to complete" })
  @Get('projects/:id/budget')
  getBudget(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budget.get(user, id);
  }

  @ApiOperation({
    summary: "One project's earned value: planned value, earned value and actual cost to date and by month, SPI, CPI, EAC and the forecast finish",
    description: 'Approvers and accounts. Planned value spreads the BOQ over the baseline (else planned) dates of its activities; earned value is approved progress or measurement at BOQ rates; both on the budget at completion.',
  })
  @Get('projects/:id/earned-value')
  getEarnedValue(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: EarnedValueQuery) {
    return this.earnedValue.get(user, id, q.basis);
  }

  @ApiOperation({
    summary: "Start a version of a project's budget: a copy of the one in force (blank when none), with these changes",
    description: 'Admin, management or the project manager. Refused while another version is open. Returns the project budget.',
  })
  @Post('projects/:id/budget/versions')
  startBudgetVersion(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBudgetVersionDto) {
    return this.budget.startVersion(user, id, dto);
  }

  @ApiOperation({ summary: 'Change a budget version while it is a draft or returned', description: 'Whoever changes it becomes its preparer, so another person decides it.' })
  @Patch('budget-versions/:vid')
  updateBudgetVersion(@CurrentUser() user: RequestUser, @Param('vid', ParseUUIDPipe) vid: string, @Body() dto: SaveBudgetVersionDto) {
    return this.budget.updateVersion(user, vid, dto);
  }

  @ApiOperation({ summary: 'Send a budget version to admin and management for approval' })
  @Post('budget-versions/:vid/submit')
  submitBudgetVersion(@CurrentUser() user: RequestUser, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.budget.submit(user, vid);
  }

  @ApiOperation({
    summary: 'Approve a submitted budget version, or return it with what to change',
    description: 'Admin or management, never its preparer. Approving puts it in force: the version before is superseded and its BOQ budget rates are copied onto the BOQ.',
  })
  @Post('budget-versions/:vid/decide')
  decideBudgetVersion(@CurrentUser() user: RequestUser, @Param('vid', ParseUUIDPipe) vid: string, @Body() dto: DecideBudgetDto) {
    return this.budget.decide(user, vid, dto);
  }

  @ApiOperation({ summary: 'Delete a budget version that is a draft or was returned' })
  @Delete('budget-versions/:vid')
  removeBudgetVersion(@CurrentUser() user: RequestUser, @Param('vid', ParseUUIDPipe) vid: string) {
    return this.budget.remove(user, vid);
  }

  @ApiOperation({
    summary: 'Cost against executed value for every visible project',
    description:
      'Approvers and accounts. Cost = approved site expenses + material issued × item rate + approved machinery logs × hire rate + attendance man-days × trade daily rate. Executed value = approved progress × BOQ rate; measured value = approved measurement sheets × BOQ rate. `unpriced` counts what has no rate yet.',
  })
  @Get('projects')
  summary(@CurrentUser() user: RequestUser, @Query() q: CostQuery) {
    return this.cost.summary(user, q);
  }

  @ApiOperation({ summary: 'One project: cost heads by month and breakdowns by expense category, item, machine and trade' })
  @Get('projects/:id')
  project(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: CostQuery) {
    return this.cost.project(user, id, q);
  }

  @ApiOperation({ summary: 'Labour daily rates by trade, and trades on attendance sheets that have none' })
  @Get('labour-rates')
  labourRates(@CurrentUser() user: RequestUser) {
    return this.cost.labourRates(user);
  }

  @ApiOperation({ summary: 'Replace the labour daily rates', description: 'Admin, management or accounts. Trades left out of the list are removed.' })
  @Put('labour-rates')
  setLabourRates(@CurrentUser() user: RequestUser, @Body() dto: SetLabourRatesDto) {
    return this.cost.setLabourRates(user, dto);
  }
}
