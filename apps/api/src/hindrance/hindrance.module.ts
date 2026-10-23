import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DocumentsModule } from '../documents/documents.module';
import { RisksModule } from '../risks/risks.module';
import { HindranceController } from './hindrance.controller';
import { HindranceService } from './hindrance.service';

/** Hindrance register to notice (AI item 123). The watch list's NOTICE_DUE is built in `WarningsService` from the same rules. */
@Module({ imports: [AiModule, DocumentsModule, RisksModule], controllers: [HindranceController], providers: [HindranceService], exports: [HindranceService] })
export class HindranceModule {}
