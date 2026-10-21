import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestsService } from './payment-requests.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNotesService } from './debit-notes.service';

@Module({
  controllers: [PayablesController, PaymentRequestsController, DebitNotesController],
  providers: [PayablesService, PaymentRequestsService, DebitNotesService],
  exports: [PayablesService, PaymentRequestsService, DebitNotesService],
})
export class PayablesModule {}
