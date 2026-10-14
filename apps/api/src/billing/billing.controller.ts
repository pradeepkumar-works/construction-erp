import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, RawBodyRequest, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/decorators';
import { AllowWhenUnpaid } from '../common/billing';
import { BillingService } from './billing.service';
import { BillingDetailsInput, CreateOrderDto, VerifyPaymentDto } from './billing.dto';

/** The company's subscription (admins), and Razorpay's webhook. Usable while the company is read-only, so it can pay. */
@ApiTags('billing')
@ApiBearerAuth()
@AllowWhenUnpaid()
@Controller('billing')
export class BillingController {
  constructor(private billing: BillingService) {}

  @ApiOperation({ summary: 'Trial or paid-up date, what the next month or year costs, and the invoice details' })
  @Get()
  summary(@CurrentUser() user: RequestUser) {
    return this.billing.summary(user);
  }

  @ApiOperation({ summary: 'Who the invoices are made out to (name, GSTIN, address, place of supply)' })
  @Put('details')
  details(@CurrentUser() user: RequestUser, @Body() dto: BillingDetailsInput) {
    return this.billing.updateDetails(user, dto);
  }

  @ApiOperation({ summary: 'Start a payment: a Razorpay order for a month or a year, for Checkout' })
  @HttpCode(200)
  @Post('orders')
  order(@CurrentUser() user: RequestUser, @Body() dto: CreateOrderDto) {
    return this.billing.createOrder(user, dto.months);
  }

  @ApiOperation({ summary: "Record a payment from Checkout's success response (signature checked)" })
  @HttpCode(200)
  @Post('verify')
  verify(@CurrentUser() user: RequestUser, @Body() dto: VerifyPaymentDto) {
    return this.billing.verify(user, dto.orderId, dto.paymentId, dto.signature);
  }

  @ApiOperation({ summary: 'GST invoices for payments made' })
  @Get('invoices')
  invoices(@CurrentUser() user: RequestUser) {
    return this.billing.invoices(user);
  }

  @ApiOperation({ summary: 'One GST invoice' })
  @Get('invoices/:id')
  invoice(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.invoice(user, id);
  }

  @ApiOperation({ summary: 'Razorpay webhook (payment.captured, order.paid), signed with RAZORPAY_WEBHOOK_SECRET' })
  @Public()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') sig?: string) {
    return this.billing.webhook(req.rawBody, sig);
  }
}
