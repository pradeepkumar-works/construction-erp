import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PayrollRunService } from './payroll-run.service';
import { SalaryService } from './salary.service';
import { SettlementService } from './settlement.service';
import { CreateRunDto, CreateSalaryStructureDto, CreateStaffLoanDto, LoanQuery, PayRunDto, PayrollSettingsDto, PayslipAdjustmentsDto, PrepareSettlementDto, RunNoteDto, RunQuery, SendBackDto, StructureQuery } from './payroll.dto';
import { ModuleSwitch } from '../common/decorators';

/** Payroll (v6 item 100): settings, salary structures, loans, salary runs with payslips and files, settlements. */
@ApiTags('payroll')
@ApiBearerAuth()
@ModuleSwitch('payroll')
@Controller('payroll')
export class PayrollRunController {
  constructor(private runs: PayrollRunService, private salary: SalaryService, private settlements: SettlementService) {}

  @ApiOperation({ summary: "The company's payroll settings: PF, ESI, professional tax state, paid days, overtime rate" })
  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.salary.settings(user);
  }

  @Put('settings')
  saveSettings(@CurrentUser() user: RequestUser, @Body() dto: PayrollSettingsDto) {
    return this.salary.saveSettings(user, dto);
  }

  @ApiOperation({ summary: "Salary structures: one employee's history, or each employee's in force today" })
  @Get('structures')
  structures(@CurrentUser() user: RequestUser, @Query() q: StructureQuery) {
    return this.salary.structures(user, q);
  }

  @ApiOperation({ summary: 'Set an employee’s salary from a date (replaces one from the same date)' })
  @Post('structures')
  createStructure(@CurrentUser() user: RequestUser, @Body() dto: CreateSalaryStructureDto) {
    return this.salary.createStructure(user, dto);
  }

  @Delete('structures/:id')
  removeStructure(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.salary.removeStructure(user, id);
  }

  @ApiOperation({ summary: 'Loans and salary advances with what is recovered and left' })
  @Get('loans')
  loans(@CurrentUser() user: RequestUser, @Query() q: LoanQuery) {
    return this.salary.loans(user, q);
  }

  @Post('loans')
  createLoan(@CurrentUser() user: RequestUser, @Body() dto: CreateStaffLoanDto) {
    return this.salary.createLoan(user, dto);
  }

  @Delete('loans/:id')
  removeLoan(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.salary.removeLoan(user, id);
  }

  @ApiOperation({ summary: 'Salary runs, newest month first' })
  @Get('runs')
  listRuns(@CurrentUser() user: RequestUser, @Query() q: RunQuery) {
    return this.runs.list(user, q);
  }

  @ApiOperation({ summary: "Prepare a month's salary run for the company or one site" })
  @Post('runs')
  createRun(@CurrentUser() user: RequestUser, @Body() dto: CreateRunDto) {
    return this.runs.create(user, dto);
  }

  @Get('runs/:id')
  run(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.detail(user, id);
  }

  @ApiOperation({ summary: 'Work a draft run out again; lines added by hand are kept' })
  @Post('runs/:id/recompute')
  recompute(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.recompute(user, id);
  }

  @Post('runs/:id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.submit(user, id);
  }

  @Post('runs/:id/approve')
  approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: RunNoteDto) {
    return this.runs.approve(user, id, dto.note);
  }

  @Post('runs/:id/send-back')
  sendBack(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SendBackDto) {
    return this.runs.sendBack(user, id, dto.note);
  }

  @Post('runs/:id/pay')
  pay(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: PayRunDto) {
    return this.runs.pay(user, id, dto);
  }

  @Delete('runs/:id')
  removeRun(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.remove(user, id);
  }

  @ApiOperation({ summary: 'The bank transfer file (NEFT CSV) of an approved run' })
  @Get('runs/:id/bank-file')
  bankFile(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.bankFile(user, id);
  }

  @ApiOperation({ summary: 'The PF electronic challan cum return (ECR 2.0 text)' })
  @Get('runs/:id/ecr')
  ecr(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.ecr(user, id);
  }

  @ApiOperation({ summary: 'The ESI monthly contribution sheet (CSV)' })
  @Get('runs/:id/esi')
  esi(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.esi(user, id);
  }

  @ApiOperation({ summary: "The caller's own payslips from approved runs" })
  @Get('my-payslips')
  mine(@CurrentUser() user: RequestUser) {
    return this.runs.mine(user);
  }

  @Get('payslips/:id')
  payslip(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.runs.payslip(user, id);
  }

  @ApiOperation({ summary: 'Set the lines added by hand to a draft payslip (arrears, bonus, other earnings and deductions)' })
  @Put('payslips/:id/adjustments')
  adjust(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: PayslipAdjustmentsDto) {
    return this.runs.adjust(user, id, dto);
  }

  @ApiOperation({ summary: 'Full and final settlements' })
  @Get('settlements')
  settlementList(@CurrentUser() user: RequestUser) {
    return this.settlements.list(user);
  }

  @ApiOperation({ summary: 'People who have left with no settlement yet' })
  @Get('settlements/due')
  settlementsDue(@CurrentUser() user: RequestUser) {
    return this.settlements.due(user);
  }

  @ApiOperation({ summary: 'Work out (or again, while a draft) the full and final settlement of someone who has left' })
  @Post('settlements')
  prepareSettlement(@CurrentUser() user: RequestUser, @Body() dto: PrepareSettlementDto) {
    return this.settlements.prepare(user, dto);
  }

  @Post('settlements/:id/approve')
  approveSettlement(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.settlements.approve(user, id);
  }

  @Post('settlements/:id/pay')
  paySettlement(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: PayRunDto) {
    return this.settlements.pay(user, id, dto);
  }

  @Delete('settlements/:id')
  removeSettlement(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.settlements.remove(user, id);
  }
}
