import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PayrollModule } from '../payroll/payroll.module';
import { BooksModule } from '../books/books.module';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRulesController } from './approval-rules.controller';
import { ApprovalRulesService } from './approval-rules.service';
import { OtherDecisionsService } from './other-decisions.service';

@Module({ imports: [StaffModule, PayrollModule, BooksModule, CorrespondenceModule], controllers: [ApprovalsController, ApprovalRulesController], providers: [ApprovalRulesService, OtherDecisionsService], exports: [OtherDecisionsService] })
export class ApprovalsModule {}
