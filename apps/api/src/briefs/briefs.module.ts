import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ReportsModule } from '../reports/reports.module';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';

/** The morning brief and the weekly narrative (AI roadmap item 74). The batch runs from `NotificationJobsService`. */
@Module({ imports: [AiModule, DashboardModule, ReportsModule], controllers: [BriefsController], providers: [BriefsService], exports: [BriefsService] })
export class BriefsModule {}
