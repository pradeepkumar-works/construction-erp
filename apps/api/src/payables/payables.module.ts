import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller';
import { PayablesService } from './payables.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentRequestsService } from './payment-requests.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNotesService } from './debit-notes.service';
import { PaymentBatchesController } from './payment-batches.controller';
import { PaymentBatchesService } from './payment-batches.service';
import { TdsModule } from '../tds/tds.module';
import { LabourComplianceModule } from '../labour-compliance/labour-compliance.module';

@Module({
  imports: [TdsModule, LabourComplianceModule],
  controllers: [PayablesController, PaymentRequestsController, DebitNotesController, PaymentBatchesController],
  providers: [PayablesService, PaymentRequestsService, DebitNotesService, PaymentBatchesService],
  exports: [PayablesService, PaymentRequestsService, DebitNotesService],
})
export class PayablesModule {}
