import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServerTimingInterceptor } from './common/server-timing';
import { GuestGuard } from './common/guest.guard';
import { SupportReadOnlyGuard } from './common/support.guard';
import { BillingReadOnlyGuard } from './common/billing';
import { PortalModule } from './portal/portal.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { PlanningModule } from './planning/planning.module';
import { ProgressModule } from './progress/progress.module';
import { DprModule } from './dpr/dpr.module';
import { StockModule } from './stock/stock.module';
import { MachineryModule } from './machinery/machinery.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CostModule } from './cost/cost.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ReportsModule } from './reports/reports.module';
import { RisksModule } from './risks/risks.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { BillChecksModule } from './checks/bill-checks.module';
import { WarningsModule } from './warnings/warnings.module';
import { BriefsModule } from './briefs/briefs.module';
import { PhotoChecksModule } from './photo-checks/photo-checks.module';
import { SafetyModule } from './safety/safety.module';
import { PpeModule } from './ppe/ppe.module';
import { RfisModule } from './rfis/rfis.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { UnitsModule } from './units/units.module';
import { SectorModule } from './sector/sector.module';
import { TemplatesModule } from './templates/templates.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { ClientsModule } from './clients/clients.module';
import { SavedViewsModule } from './saved-views/saved-views.module';
import { VariationsModule } from './variations/variations.module';
import { ContractsModule } from './contracts/contracts.module';
import { RaBillsModule } from './ra-bills/ra-bills.module';
import { ReceivablesModule } from './receivables/receivables.module';
import { VendorsModule } from './vendors/vendors.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { SubcontractsModule } from './subcontracts/subcontracts.module';
import { PayablesModule } from './payables/payables.module';
import { TallyModule } from './tally/tally.module';
import { GstModule } from './gst/gst.module';
import { InspectionsModule } from './inspections/inspections.module';
import { QualityModule } from './quality/quality.module';
import { DocumentsModule } from './documents/documents.module';
import { StaffModule } from './staff/staff.module';
import { AttendanceModule } from './attendance/attendance.module';
import { WorkersModule } from './workers/workers.module';
import { ImprestModule } from './imprest/imprest.module';
import { ComplianceModule } from './compliance/compliance.module';
import { HandoverModule } from './handover/handover.module';
import { MaterialRequestsModule } from './material-requests/material-requests.module';
import { EnquiriesModule } from './enquiries/enquiries.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UndoModule } from './undo/undo.module';
import { HealthController } from './health.controller';
import { VitalsController } from './vitals.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    PlanningModule,
    ProgressModule,
    DprModule,
    AttendanceModule,
    WorkersModule,
    ImprestModule,
    ComplianceModule,
    HandoverModule,
    MaterialRequestsModule,
    EnquiriesModule,
    StockModule,
    MachineryModule,
    ExpensesModule,
    MeasurementsModule,
    ClientsModule,
    SavedViewsModule,
    VariationsModule,
    ContractsModule,
    RaBillsModule,
    ReceivablesModule,
    VendorsModule,
    PurchasingModule,
    SubcontractsModule,
    PayablesModule,
    TallyModule,
    GstModule,
    InspectionsModule,
    QualityModule,
    DocumentsModule,
    StaffModule,
    CostModule,
    ReconciliationModule,
    ReportsModule,
    RisksModule,
    SearchModule,
    AiModule,
    BillChecksModule,
    WarningsModule,
    BriefsModule,
    PhotoChecksModule,
    SafetyModule,
    PpeModule,
    RfisModule,
    MaintenanceModule,
    UnitsModule,
    SectorModule,
    TemplatesModule,
    ApprovalsModule,
    DashboardModule,
    UploadsModule,
    NotificationsModule,
    UndoModule,
    PortalModule,
    PlatformModule,
  ],
  controllers: [HealthController, VitalsController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: GuestGuard },
    { provide: APP_GUARD, useClass: SupportReadOnlyGuard },
    { provide: APP_GUARD, useClass: BillingReadOnlyGuard },
    { provide: APP_INTERCEPTOR, useClass: ServerTimingInterceptor },
  ],
})
export class AppModule {}
