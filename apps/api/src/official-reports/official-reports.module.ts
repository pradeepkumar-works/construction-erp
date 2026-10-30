import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { ContractsModule } from '../contracts/contracts.module';
import { StageBillingModule } from '../stage-billing/stage-billing.module';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { OfficialReportsController } from './official-reports.controller';
import { OfficialReportsService } from './official-reports.service';

/** Official progress reports (item 167): the daily, weekly and monthly reports for the client, and their issue register. */
@Module({
  imports: [ReportsModule, ContractsModule, StageBillingModule, CorrespondenceModule],
  controllers: [OfficialReportsController],
  providers: [OfficialReportsService],
})
export class OfficialReportsModule {}
