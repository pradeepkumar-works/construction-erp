import { Module } from '@nestjs/common';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { WarningsController } from './warnings.controller';
import { WarningsService } from './warnings.service';

/** Early warnings, the watch list (AI roadmap item 73). The weekly notification is `NotificationJobsService.watchList`. */
@Module({ imports: [ReceivablesModule, PayablesModule], controllers: [WarningsController], providers: [WarningsService], exports: [WarningsService] })
export class WarningsModule {}
