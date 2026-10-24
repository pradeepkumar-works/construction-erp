import { Module } from '@nestjs/common';
import { RaBillsController } from './ra-bills.controller';
import { RaBillsService } from './ra-bills.service';
import { ReceivablesModule } from '../receivables/receivables.module';
import { StageBillingModule } from '../stage-billing/stage-billing.module';

@Module({ imports: [ReceivablesModule, StageBillingModule], controllers: [RaBillsController], providers: [RaBillsService], exports: [RaBillsService] })
export class RaBillsModule {}
