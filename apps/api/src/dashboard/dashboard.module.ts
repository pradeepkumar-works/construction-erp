import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ProjectsModule } from '../projects/projects.module';
import { PlanningModule } from '../planning/planning.module';
import { ProgressModule } from '../progress/progress.module';
import { DprModule } from '../dpr/dpr.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { CostModule } from '../cost/cost.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { StockModule } from '../stock/stock.module';
import { WarningsModule } from '../warnings/warnings.module';
import { MachineryModule } from '../machinery/machinery.module';
import { HomeService } from './home.service';

@Module({ imports: [ProjectsModule, PlanningModule, ProgressModule, DprModule, ReceivablesModule, PayablesModule, CostModule, PurchasingModule, ComplianceModule, StockModule, WarningsModule, MachineryModule], controllers: [DashboardController], providers: [DashboardService, HomeService], exports: [DashboardService, HomeService] })
export class DashboardModule {}
