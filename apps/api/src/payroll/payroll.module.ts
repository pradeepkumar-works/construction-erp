import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PayrollRunController } from './payroll-run.controller';
import { PayrollRunService } from './payroll-run.service';
import { SalaryService } from './salary.service';
import { SettlementService } from './settlement.service';

@Module({ imports: [StaffModule], controllers: [PayrollRunController], providers: [PayrollRunService, SalaryService, SettlementService], exports: [PayrollRunService, SalaryService] })
export class PayrollModule {}
