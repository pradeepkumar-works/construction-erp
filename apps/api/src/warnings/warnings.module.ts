import { Module } from '@nestjs/common';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { LeakageModule } from '../leakage/leakage.module';
import { CashForecastModule } from '../cash-forecast/cash-forecast.module';
import { AttendanceCheckModule } from '../attendance-check/attendance-check.module';
import { QaModule } from '../qa/qa.module';
import { WarningsController } from './warnings.controller';
import { WarningsService } from './warnings.service';

/** Early warnings, the watch list (AI roadmap item 73). The weekly notification is `NotificationJobsService.watchList`. */
@Module({ imports: [ReceivablesModule, PayablesModule, ReconciliationModule, LeakageModule, CashForecastModule, AttendanceCheckModule, QaModule], controllers: [WarningsController], providers: [WarningsService], exports: [WarningsService] })
export class WarningsModule {}
