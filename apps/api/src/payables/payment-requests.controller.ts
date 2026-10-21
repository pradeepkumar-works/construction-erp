import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequestUser } from '../common/current-user';
import { PaymentRequestsService } from './payment-requests.service';
import { CreatePaymentRequestDto, ListPaymentRequestsQuery, UpdatePaymentRequestDto } from './payables.dto';

@ApiTags('payables')
@ApiBearerAuth()
@Controller('payment-requests')
export class PaymentRequestsController {
  constructor(private requests: PaymentRequestsService) {}

  @ApiOperation({ summary: 'Payment requests (paged)', description: 'Requests to pay an approved bill or release an advance against a purchase order or work order (v5 item 90).' })
  @Get()
  list(@CurrentUser() user: RequestUser, @Query() q: ListPaymentRequestsQuery) {
    return this.requests.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requests.get(user, id);
  }

  @ApiOperation({
    summary: 'Ask for a payment',
    description:
      'kind BILL with vendorBillId or subcontractBillId (approved), PO_ADVANCE with purchaseOrderId or WO_ADVANCE with workOrderId (approved and open). ' +
      'The amount is at most what the bill has unpaid less other open requests on it, or the order value less advances already asked for. Approved through the approval matrix (PAYMENT_REQUEST).',
  })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentRequestDto) {
    return this.requests.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdatePaymentRequestDto) {
    return this.requests.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requests.submit(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requests.remove(user, id);
  }
}
