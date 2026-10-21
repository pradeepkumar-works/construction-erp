import { Module } from '@nestjs/common';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { RateAnalysisService } from './rate-analysis.service';

@Module({
  imports: [SubcontractsModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, RateAnalysisService],
  exports: [ReconciliationService, RateAnalysisService],
})
export class ReconciliationModule {}
