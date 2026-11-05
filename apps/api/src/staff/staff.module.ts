import { HrService } from './hr.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

import { ExitClearanceService } from './exit-clearance.service';
import { LetterTemplatesService } from './letter-templates.service';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [AttendanceModule],
  controllers: [StaffController, PayrollController],
  providers: [StaffService, PayrollService, HrService, EmployeeDocumentsService, ExitClearanceService, LetterTemplatesService, AttendanceCorrectionsService],
  exports: [StaffService, HrService, PayrollService, EmployeeDocumentsService, ExitClearanceService, LetterTemplatesService, AttendanceCorrectionsService],
})
export class StaffModule {}
