import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { CashForecastService } from './cash-forecast.service';
import { BillingReadinessQuery } from './cash-forecast.dto';

@ApiTags('cash-forecast')
@ApiBearerAuth()
@Controller()
export class CashForecastController {
  constructor(private cash: CashForecastService) {}

  @ApiOperation({
    summary: 'The 13-week cash forecast',
    description:
      'Item 122. The bank and cash ledgers today, then 13 weeks of money in (open client bills at each client’s days to pay, measured work not billed) and out (open bills, purchase and work orders, salaries, machine loan EMIs, statutory dues, approved advances), each week as a low, likely and high balance, why a short week is short, what to chase or hold, and how far the forecast of four weeks ago was out. Accounts and management (`canSeeCashForecast`).',
  })
  @Get('cash-forecast')
  forecast(@CurrentUser() user: RequestUser) {
    return this.cash.forecast(user);
  }

  @ApiOperation({ summary: 'Billing readiness', description: 'Item 122. Per project: approved measurements in no RA bill (at BOQ rates), approved RA bills not sent to the client, and sent bills unpaid past the client’s days.' })
  @Get('billing-readiness')
  readiness(@CurrentUser() user: RequestUser, @Query() q: BillingReadinessQuery) {
    return this.cash.readiness(user, q.projectId);
  }

  @ApiOperation({ summary: 'Draft a payment reminder', description: 'Item 122. An OUT letter for a sent RA bill, with its figures and the contract’s payment clause found by document search, returned as form values. Nothing is saved.' })
  @Get('billing-readiness/reminder/:billId')
  reminder(@CurrentUser() user: RequestUser, @Param('billId', ParseUUIDPipe) billId: string) {
    return this.cash.reminder(user, billId);
  }
}
