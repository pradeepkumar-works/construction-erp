import { HrService } from './hr.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({ controllers: [StaffController, PayrollController], providers: [StaffService, PayrollService, HrService, EmployeeDocumentsService], exports: [StaffService, HrService, PayrollService, EmployeeDocumentsService] })
export class StaffModule {}
