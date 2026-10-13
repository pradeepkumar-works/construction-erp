import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalRulesController } from './approval-rules.controller';
import { ApprovalRulesService } from './approval-rules.service';

@Module({ controllers: [ApprovalsController, ApprovalRulesController], providers: [ApprovalRulesService] })
export class ApprovalsModule {}
