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
import { MaterialRequestsModule } from './material-requests/material-requests.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadsModule } from './uploads/uploads.module';
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
    MaterialRequestsModule,
    ApprovalsModule,
    DashboardModule,
    UploadsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
