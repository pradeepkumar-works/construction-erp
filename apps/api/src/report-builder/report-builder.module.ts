import { Module } from '@nestjs/common';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { MaterialRequestsModule } from '../material-requests/material-requests.module';
import { StockModule } from '../stock/stock.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ProjectsModule } from '../projects/projects.module';
import { ReportBuilderController } from './report-builder.controller';
import { ReportBuilderService } from './report-builder.service';
import { ReportSchedulesService } from './report-schedules.service';

@Module({
  imports: [PurchasingModule, RaBillsModule, MaterialRequestsModule, StockModule, VendorsModule, ProjectsModule],
  controllers: [ReportBuilderController],
  providers: [ReportBuilderService, ReportSchedulesService],
  exports: [ReportBuilderService, ReportSchedulesService],
})
export class ReportBuilderModule {}
