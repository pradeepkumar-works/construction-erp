import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestsService } from './payment-requests.service';

@Module({ controllers: [PayablesController, PaymentRequestsController], providers: [PayablesService, PaymentRequestsService], exports: [PayablesService, PaymentRequestsService] })
export class PayablesModule {}
