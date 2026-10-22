import { Module } from '@nestjs/common';
import { MaterialApprovalsController } from './material-approvals.controller';
import { MaterialApprovalsService } from './material-approvals.service';

@Module({
  controllers: [MaterialApprovalsController],
  providers: [MaterialApprovalsService],
  exports: [MaterialApprovalsService],
})
export class MaterialApprovalsModule {}
