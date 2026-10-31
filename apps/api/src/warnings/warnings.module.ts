import { ProgrammeModule } from '../programme/programme.module';
import { Module } from '@nestjs/common';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { LeakageModule } from '../leakage/leakage.module';
import { CashForecastModule } from '../cash-forecast/cash-forecast.module';
import { AttendanceCheckModule } from '../attendance-check/attendance-check.module';
import { QaModule } from '../qa/qa.module';
import { DesignModule } from '../design/design.module';
import { CostModule } from '../cost/cost.module';
import { QualityModule } from '../quality/quality.module';
import { TelematicsModule } from '../telematics/telematics.module';
import { WeighbridgeModule } from '../weighbridge/weighbridge.module';
import { WarningsController } from './warnings.controller';
import { WarningsService } from './warnings.service';

/** Early warnings, the watch list (AI roadmap item 73). The weekly notification is `NotificationJobsService.watchList`. */
@Module({ imports: [ReceivablesModule, PayablesModule, ReconciliationModule, LeakageModule, CashForecastModule, AttendanceCheckModule, QaModule, DesignModule, CostModule, QualityModule, TelematicsModule, WeighbridgeModule, ProgrammeModule], controllers: [WarningsController], providers: [WarningsService], exports: [WarningsService] })
export class WarningsModule {}
