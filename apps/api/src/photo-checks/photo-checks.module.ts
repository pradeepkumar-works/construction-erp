import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DprModule } from '../dpr/dpr.module';
import { ProgressModule } from '../progress/progress.module';
import { SafetyModule } from '../safety/safety.module';
import { HandoverModule } from '../handover/handover.module';
import { PhotoChecksController } from './photo-checks.controller';
import { PhotoChecksService } from './photo-checks.service';

/** Site photo captions and flags. */
@Module({ imports: [AiModule, DprModule, ProgressModule, SafetyModule, HandoverModule], controllers: [PhotoChecksController], providers: [PhotoChecksService], exports: [PhotoChecksService] })
export class PhotoChecksModule {}
