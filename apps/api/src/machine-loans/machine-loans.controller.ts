import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { MachineLoansService } from './machine-loans.service';
import { CreateEquipmentLoanDto, EquipmentLoanQuery, ForecloseDto, LoanPreviewQuery, PayEmiDto, UpdateEquipmentLoanDto } from './machine-loans.dto';
import { ModuleSwitch } from '../common/decorators';

/** Machine finance: loans on financed machines, their EMI schedules and EMIs paid. Admin, management and accounts. */
@ApiTags('machine-loans')
@ApiBearerAuth()
@ModuleSwitch('machine_loans')
@Controller('machine-loans')
export class MachineLoansController {
  constructor(private loans: MachineLoansService) {}

  @ApiOperation({ summary: 'Machine loans, with what each has repaid, owes and has overdue, and the running loans by lender' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: EquipmentLoanQuery) {
    return this.loans.list(user, q);
  }

  @ApiOperation({ summary: 'The EMI and schedule some terms give (the form shows it as it is typed)', description: 'Each month’s interest is the yearly rate’s twelfth on what is owed at its start; the last EMI clears what is left.' })
  @Get('preview')
  preview(@CurrentUser() user: RequestUser, @Query() q: LoanPreviewQuery) {
    return this.loans.preview(user, q);
  }

  @ApiOperation({ summary: 'A loan with its EMI schedule and the machine’s cost of finance', description: 'The id may also be one of its EMIs’ (the books link a posted EMI here).' })
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.get(user, id);
  }

  @ApiOperation({ summary: 'Record a loan on an owned machine; its EMI schedule is built from the terms' })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEquipmentLoanDto) {
    return this.loans.create(user, dto);
  }

  @ApiOperation({ summary: 'Change a loan: its terms until the first EMI is paid, the lender and note any time' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEquipmentLoanDto) {
    return this.loans.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Delete a loan entered by mistake (no EMI paid, not sent to Tally)' })
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.remove(user, id);
  }

  @ApiOperation({ summary: 'Record an EMI paid (the next one unless `no` is given); EMIs are paid in order, and the last closes the loan' })
  @Post(':id/pay')
  pay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayEmiDto) {
    return this.loans.pay(user, id, dto);
  }

  @ApiOperation({ summary: 'Close the loan early: the next EMI repays all that is owed with the lender’s interest, and the later ones go' })
  @Post(':id/foreclose')
  foreclose(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ForecloseDto) {
    return this.loans.foreclose(user, id, dto);
  }

  @ApiOperation({ summary: 'Undo the last EMI recorded paid (not once Tally has it, nor inside the locked books)' })
  @Post(':id/undo-pay')
  undoPay(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.loans.undoPay(user, id);
  }
}
