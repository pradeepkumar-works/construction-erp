import { Module } from '@nestjs/common';
import { LeakageModule } from '../leakage/leakage.module';
import { CashForecastModule } from '../cash-forecast/cash-forecast.module';
import { AttendanceCheckModule } from '../attendance-check/attendance-check.module';
import { AiModule } from '../ai/ai.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

/** The watch list's Other checks strip. */
@Module({ imports: [LeakageModule, CashForecastModule, AttendanceCheckModule, AiModule], controllers: [InsightsController], providers: [InsightsService] })
export class InsightsModule {}
