import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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
import { ReportsModule } from './reports/reports.module';
import { RisksModule } from './risks/risks.module';
import { TemplatesModule } from './templates/templates.module';
import { MeasurementsModule } from './measurements/measurements.module';
import { ClientsModule } from './clients/clients.module';
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
import { MaterialRequestsModule } from './material-requests/material-requests.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthController } from './health.controller';

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
    MaterialRequestsModule,
    StockModule,
    MachineryModule,
    ExpensesModule,
    MeasurementsModule,
    ClientsModule,
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
    ReportsModule,
    RisksModule,
    TemplatesModule,
    ApprovalsModule,
    DashboardModule,
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
