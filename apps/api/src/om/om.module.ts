import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { OmController } from './om.controller';
import { OmService } from './om.service';

/** O&M contract: terms, daily service levels, staff, chemicals; its bills go through RA bills. */
@Module({
  imports: [ReconciliationModule],
  controllers: [OmController],
  providers: [OmService],
  exports: [OmService],
})
export class OmModule {}
