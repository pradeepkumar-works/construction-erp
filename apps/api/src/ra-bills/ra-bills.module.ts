import { Module } from '@nestjs/common';
import { RaBillsController } from './ra-bills.controller';
import { RaBillsService } from './ra-bills.service';
import { ReceivablesModule } from '../receivables/receivables.module';
import { StageBillingModule } from '../stage-billing/stage-billing.module';
import { ConsultantChecksModule } from '../consultant-checks/consultant-checks.module';

@Module({ imports: [ReceivablesModule, StageBillingModule, ConsultantChecksModule], controllers: [RaBillsController], providers: [RaBillsService], exports: [RaBillsService] })
export class RaBillsModule {}
