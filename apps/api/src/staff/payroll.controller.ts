import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PayrollService } from './payroll.service';
import { PayrollQuery } from './staff.dto';
import { ModuleSwitch } from '../common/decorators';

@ApiTags('payroll')
@ApiBearerAuth()
@ModuleSwitch('payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private payroll: PayrollService) {}

  @ApiOperation({
    summary: 'Payroll inputs for a month: days on the rolls, Sundays and holidays, present, leave by type, absent, not marked, overtime, loss of pay',
    description: 'HR, accounts, management and admins. No statutory calculations: the payroll provider works from these.',
  })
  @Get('staff')
  staff(@CurrentUser() user: RequestUser, @Query() q: PayrollQuery) {
    return this.payroll.staffMonth(user, q.month, q.projectId);
  }

  @ApiOperation({ summary: 'Labour contractors for a month: man-days by project and trade from the attendance register, at the daily rates' })
  @Get('contractors')
  contractors(@CurrentUser() user: RequestUser, @Query() q: PayrollQuery) {
    return this.payroll.contractorMonth(user, q.month, q.projectId);
  }
}
