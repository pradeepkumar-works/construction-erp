import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { DprModule } from '../dpr/dpr.module';
import { ProgressModule } from '../progress/progress.module';
import { MaterialRequestsModule } from '../material-requests/material-requests.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { MachineryModule } from '../machinery/machinery.module';
import { RisksModule } from '../risks/risks.module';
import { VariationsModule } from '../variations/variations.module';
import { SafetyModule } from '../safety/safety.module';
import { DocumentsModule } from '../documents/documents.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { StockModule } from '../stock/stock.module';
import { ProjectsModule } from '../projects/projects.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { CostModule } from '../cost/cost.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { ContractsModule } from '../contracts/contracts.module';
import { QualityModule } from '../quality/quality.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { PlanningModule } from '../planning/planning.module';
import { VendorsModule } from '../vendors/vendors.module';
import { UnitsModule } from '../units/units.module';
import { ClientsModule } from '../clients/clients.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiToolsService } from './ai-tools.service';
import { AiDigestService } from './ai-digest.service';
import { AiReadService } from './ai-read.service';
import { AiDraftsService } from './ai-drafts.service';

@Module({
  imports: [
    SearchModule,
    ClientsModule,
    DprModule,
    ProgressModule,
    MaterialRequestsModule,
    PurchasingModule,
    SubcontractsModule,
    RaBillsModule,
    MeasurementsModule,
    ExpensesModule,
    InspectionsModule,
    MachineryModule,
    RisksModule,
    VariationsModule,
    SafetyModule,
    DocumentsModule,
    AttendanceModule,
    ReceivablesModule,
    PayablesModule,
    StockModule,
    ProjectsModule,
    DashboardModule,
    CostModule,
    ReconciliationModule,
    ContractsModule,
    QualityModule,
    MaintenanceModule,
    PlanningModule,
    VendorsModule,
    UnitsModule,
  ],
  controllers: [AiController],
  providers: [AiService, AiToolsService, AiDigestService, AiReadService, AiDraftsService],
  exports: [AiService, AiToolsService],
})
export class AiModule {}
