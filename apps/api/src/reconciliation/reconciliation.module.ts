import { Module } from '@nestjs/common';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { PipeNetworkModule } from '../pipe-network/pipe-network.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { RateAnalysisService } from './rate-analysis.service';
import { StockViewsService } from './stock-views.service';

@Module({
  imports: [SubcontractsModule, PipeNetworkModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, RateAnalysisService, StockViewsService],
  exports: [ReconciliationService, RateAnalysisService, StockViewsService],
})
export class ReconciliationModule {}
