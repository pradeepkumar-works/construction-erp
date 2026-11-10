import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PayrollRunController } from './payroll-run.controller';
import { PayrollRunService } from './payroll-run.service';
import { SalaryService } from './salary.service';
import { SettlementService } from './settlement.service';

import { HrReportsService } from './hr-reports.service';
import { TdsModule } from '../tds/tds.module';

@Module({ imports: [StaffModule, TdsModule], controllers: [PayrollRunController], providers: [PayrollRunService, SalaryService, SettlementService, HrReportsService], exports: [PayrollRunService, SalaryService, SettlementService, HrReportsService] })
export class PayrollModule {}
