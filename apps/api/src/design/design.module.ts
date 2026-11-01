import { Module } from '@nestjs/common';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { DocumentsModule } from '../documents/documents.module';
import { EpcModule } from '../epc/epc.module';
import { RisksModule } from '../risks/risks.module';
import { DrawingScheduleController } from './drawing-schedule.controller';
import { DrawingScheduleService } from './drawing-schedule.service';
import { DesignSubmissionsController } from './design-submissions.controller';
import { DesignSubmissionsService } from './design-submissions.service';
import { DesignControlController } from './design-control.controller';
import { DesignControlService } from './design-control.service';

/** Design and drawings, over the register in `DocumentsModule`. */
@Module({
  imports: [CorrespondenceModule, DocumentsModule, EpcModule, RisksModule],
  controllers: [DrawingScheduleController, DesignSubmissionsController, DesignControlController],
  providers: [DrawingScheduleService, DesignSubmissionsService, DesignControlService],
  exports: [DrawingScheduleService, DesignSubmissionsService, DesignControlService],
})
export class DesignModule {}
