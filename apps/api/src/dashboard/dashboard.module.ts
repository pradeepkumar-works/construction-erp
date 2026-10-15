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

@Module({ imports: [ProjectsModule, PlanningModule, ProgressModule, DprModule, ReceivablesModule, PayablesModule, CostModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
