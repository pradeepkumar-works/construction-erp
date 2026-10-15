import { Module } from '@nestjs/common';
import { CostController } from './cost.controller';
import { CostService } from './cost.service';
import { BudgetService } from './budget.service';
import { CashFlowService } from './cash-flow.service';
import { VariationsModule } from '../variations/variations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';

@Module({
  imports: [VariationsModule, ReceivablesModule, PayablesModule],
  controllers: [CostController],
  providers: [CostService, BudgetService, CashFlowService],
  exports: [CostService, BudgetService],
})
export class CostModule {}
