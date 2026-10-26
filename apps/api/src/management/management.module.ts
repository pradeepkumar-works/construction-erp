import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { CostModule } from '../cost/cost.module';
import { CashForecastModule } from '../cash-forecast/cash-forecast.module';
import { StockModule } from '../stock/stock.module';
import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';
import { ManagementReportsService } from './management-reports.service';

/** Management dashboard and reports: the portfolio, a project's drill-down and the printable reports. */
@Module({
  imports: [ProjectsModule, ReceivablesModule, PayablesModule, CostModule, CashForecastModule, StockModule],
  controllers: [ManagementController],
  providers: [ManagementService, ManagementReportsService],
  exports: [ManagementService],
})
export class ManagementModule {}
