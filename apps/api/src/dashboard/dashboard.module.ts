import { PayrollModule } from '../payroll/payroll.module';
import { Module } from '@nestjs/common';
import { QaModule } from '../qa/qa.module';
import { BooksModule } from '../books/books.module';
import { StatementsModule } from '../statements/statements.module';
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
import { StaffModule } from '../staff/staff.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { HomeService } from './home.service';
import { ModuleHomeService } from './module-home.service';

import { DesignModule } from '../design/design.module';

@Module({ imports: [ProjectsModule, PlanningModule, ProgressModule, DprModule, ReceivablesModule, PayablesModule, CostModule, PurchasingModule, ComplianceModule, StockModule, WarningsModule, MachineryModule, StaffModule, PayrollModule, BooksModule, StatementsModule, MeetingsModule, CorrespondenceModule, QaModule, DesignModule], controllers: [DashboardController], providers: [DashboardService, HomeService, ModuleHomeService], exports: [DashboardService, HomeService] })
export class DashboardModule {}
