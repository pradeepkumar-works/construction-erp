import { Module } from '@nestjs/common';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { DocumentsModule } from '../documents/documents.module';
import { EpcModule } from '../epc/epc.module';
import { RisksModule } from '../risks/risks.module';
import { DrawingScheduleController } from './drawing-schedule.controller';
import { DrawingScheduleService } from './drawing-schedule.service';
import { DesignSubmissionsController } from './design-submissions.controller';
import { DesignSubmissionsService } from './design-submissions.service';

/** Design and drawings (item 138), over the register in `DocumentsModule`. */
@Module({
  imports: [CorrespondenceModule, DocumentsModule, EpcModule, RisksModule],
  controllers: [DrawingScheduleController, DesignSubmissionsController],
  providers: [DrawingScheduleService, DesignSubmissionsService],
  exports: [DrawingScheduleService, DesignSubmissionsService],
})
export class DesignModule {}
