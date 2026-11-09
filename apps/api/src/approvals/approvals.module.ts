import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { PayrollModule } from '../payroll/payroll.module';
import { BooksModule } from '../books/books.module';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { CostModule } from '../cost/cost.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRulesController } from './approval-rules.controller';
import { ApprovalRulesService } from './approval-rules.service';
import { OtherDecisionsService } from './other-decisions.service';
import { ApprovalDelegationsController } from './approval-delegations.controller';
import { ApprovalDelegationsService } from './approval-delegations.service';

@Module({ imports: [StaffModule, PayrollModule, BooksModule, CorrespondenceModule, CostModule], controllers: [ApprovalsController, ApprovalRulesController, ApprovalDelegationsController], providers: [ApprovalRulesService, OtherDecisionsService, ApprovalDelegationsService], exports: [OtherDecisionsService] })
export class ApprovalsModule {}
