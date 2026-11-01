import { Module } from '@nestjs/common';
import { RisksModule } from '../risks/risks.module';
import { EpcController } from './epc.controller';
import { EpcService } from './epc.service';

/** EPC packages and engineering deliverables. */
@Module({
  imports: [RisksModule],
  controllers: [EpcController],
  providers: [EpcService],
  exports: [EpcService],
})
export class EpcModule {}
