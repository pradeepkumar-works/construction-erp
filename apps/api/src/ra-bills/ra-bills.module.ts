import { Module } from '@nestjs/common';
import { RaBillsController } from './ra-bills.controller';
import { RaBillsService } from './ra-bills.service';
import { ReceivablesModule } from '../receivables/receivables.module';
import { StageBillingModule } from '../stage-billing/stage-billing.module';
import { ConsultantChecksModule } from '../consultant-checks/consultant-checks.module';
import { StockModule } from '../stock/stock.module';

@Module({ imports: [ReceivablesModule, StageBillingModule, ConsultantChecksModule, StockModule], controllers: [RaBillsController], providers: [RaBillsService], exports: [RaBillsService] })
export class RaBillsModule {}
