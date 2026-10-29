import { Module } from '@nestjs/common';
import { CorrespondenceModule } from '../correspondence/correspondence.module';
import { RisksModule } from '../risks/risks.module';
import { DrawingScheduleController } from './drawing-schedule.controller';
import { DrawingScheduleService } from './drawing-schedule.service';

/** Design and drawings (item 138), over the register in `DocumentsModule`. */
@Module({ imports: [CorrespondenceModule, RisksModule], controllers: [DrawingScheduleController], providers: [DrawingScheduleService], exports: [DrawingScheduleService] })
export class DesignModule {}
