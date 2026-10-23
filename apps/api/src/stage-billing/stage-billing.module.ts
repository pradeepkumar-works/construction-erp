import { Module } from '@nestjs/common';
import { StageBillingController } from './stage-billing.controller';
import { StageBillingService } from './stage-billing.service';

@Module({
  controllers: [StageBillingController],
  providers: [StageBillingService],
  exports: [StageBillingService],
})
export class StageBillingModule {}
