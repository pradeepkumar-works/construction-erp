import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServerTimingInterceptor } from './common/server-timing';
import { GuestGuard } from './common/guest.guard';
import { ModuleSwitchGuard } from './common/module-switch.guard';
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
import { StructureModule } from './structure/structure.module';
import { TypeUpdatesModule } from './type-updates/type-updates.module';
import { PipeNetworkModule } from './pipe-network/pipe-network.module';
import { ProgressModule } from './progress/progress.module';
import { DprModule } from './dpr/dpr.module';
import { StockModule } from './stock/stock.module';
import { MachineryModule } from './machinery/machinery.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CostModule } from './cost/cost.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { ReportsModule } from './reports/reports.module';
import { RisksModule } from './risks/risks.module';
import { EpcModule } from './epc/epc.module';
import { OmModule } from './om/om.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { BillChecksModule } from './checks/bill-checks.module';
import { WarningsModule } from './warnings/warnings.module';
import { BriefsModule } from './briefs/briefs.module';
import { PhotoChecksModule } from './photo-checks/photo-checks.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { LeakageModule } from './leakage/leakage.module';
import { CashForecastModule } from './cash-forecast/cash-forecast.module';
import { ManagementModule } from './management/management.module';
import { HindranceModule } from './hindrance/hindrance.module';
import { AttendanceCheckModule } from './attendance-check/attendance-check.module';
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
import { LauncherModule } from './launcher/launcher.module';
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
import { PayrollModule } from './payroll/payroll.module';
import { BiometricModule } from './biometric/biometric.module';
import { BooksModule } from './books/books.module';
import { StatementsModule } from './statements/statements.module';
import { RmcModule } from './rmc/rmc.module';
import { MachineLoansModule } from './machine-loans/machine-loans.module';
import { TendersModule } from './tenders/tenders.module';
import { MeetingsModule } from './meetings/meetings.module';
import { MaterialApprovalsModule } from './material-approvals/material-approvals.module';
import { CommentsModule } from './comments/comments.module';
import { ModuleSwitchesModule } from './module-switches/module-switches.module';
import { NavSettingsModule } from './nav-settings/nav-settings.module';
import { GroupModule } from './group/group.module';
import { SupplierModule } from './supplier/supplier.module';
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
    StructureModule,
    TypeUpdatesModule,
    PipeNetworkModule,
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
    LauncherModule,
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
    PayrollModule,
    BiometricModule,
    BooksModule,
    StatementsModule,
    RmcModule,
    MachineLoansModule,
    TendersModule,
    MeetingsModule,
    MaterialApprovalsModule,
    CommentsModule,
    ModuleSwitchesModule,
    NavSettingsModule,
    GroupModule,
    SupplierModule,
    CostModule,
    ReconciliationModule,
    ReportsModule,
    RisksModule,
    EpcModule,
    OmModule,
    SearchModule,
    AiModule,
    BillChecksModule,
    WarningsModule,
    BriefsModule,
    PhotoChecksModule,
    WhatsappModule,
    LeakageModule,
    CashForecastModule,
    ManagementModule,
    HindranceModule,
    AttendanceCheckModule,
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
    { provide: APP_GUARD, useClass: ModuleSwitchGuard },
    { provide: APP_INTERCEPTOR, useClass: ServerTimingInterceptor },
  ],
})
export class AppModule {}
