import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PayablesService } from './payables.service';
import { CreatePaymentDto, ListPaymentsQuery, PayablesQuery, UpdatePaymentDto } from './payables.dto';

@ApiTags('payables')
@ApiBearerAuth()
@Controller()
export class PayablesController {
  constructor(private payables: PayablesService) {}

  @ApiOperation({
    summary: 'Payables as of today',
    description:
      'Approved vendor and subcontractor bills: billed, paid, deducted and outstanding per vendor and project, outstanding aged from each due date, ' +
      'and the due list with micro and small enterprises flagged within 7 days of their due date (45 days at most).',
  })
  @Get('payables')
  summary(@CurrentUser() user: RequestUser, @Query() q: PayablesQuery) {
    return this.payables.summary(user, q);
  }

  @ApiOperation({ summary: 'Payments to vendors and subcontractors (paged)' })
  @Get('vendor-payments')
  list(@CurrentUser() user: RequestUser, @Query() q: ListPaymentsQuery) {
    return this.payables.list(user, q);
  }

  @Get('vendor-payments/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.payables.get(user, id);
  }

  @ApiOperation({
    summary: 'Record a payment against an approved bill',
    description: 'Give vendorBillId or subcontractBillId. The bill is paid once paid plus deducted covers what it says is payable. Admin, management and accounts.',
  })
  @Post('vendor-payments')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentDto) {
    return this.payables.create(user, dto);
  }

  @Patch('vendor-payments/:id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.payables.update(user, id, dto);
  }

  @ApiOperation({ summary: 'Take off a payment entered by mistake' })
  @Delete('vendor-payments/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.payables.remove(user, id);
  }
}
