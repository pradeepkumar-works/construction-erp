import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ListExpensesQuery, UpdateExpenseDto } from './expenses.dto';
import { CurrentUser, RequestUser } from '../common/current-user';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private expenses: ExpensesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListExpensesQuery) {
    return this.expenses.list(user, q);
  }

  @ApiOperation({ summary: 'Totals for the expenses matching the list filters', description: 'Count, taxable, GST and total; approved (project cost) and pending totals; totals by category.' })
  @Get('summary')
  summary(@CurrentUser() user: RequestUser, @Query() q: ListExpensesQuery) {
    return this.expenses.summary(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.expenses.get(user, id);
  }

  @ApiOperation({
    summary: 'File a site expense',
    description: 'Numbered EXP-<year>-0001. GST is computed from `gstRate` unless the bill’s `gstAmount` is sent (within ₹1). Submitted for approval unless `submit: false`.',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, dto);
  }

  @ApiOperation({ summary: 'Edit an expense', description: 'Same rules as other submissions. `attachmentIds`, when sent, replaces the bill photos. `submit: true` resubmits.' })
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Submit or resubmit an expense for approval' })
  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.expenses.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.expenses.remove(user, id);
  }
}
