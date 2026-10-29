import { Module } from '@nestjs/common';
import { InspectionsModule } from '../inspections/inspections.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { PoursService } from './pours.service';
import { QaRegistersController } from './registers.controller';
import { QaRegistersService } from './registers.service';
import { QaAuditsController } from './audits.controller';
import { QaAuditsService } from './audits.service';
import { QaReportService } from './report.service';
import { QualityModule } from '../quality/quality.module';

@Module({ imports: [InspectionsModule, QualityModule], controllers: [QaController, QaRegistersController, QaAuditsController], providers: [QaService, PoursService, QaRegistersService, QaAuditsService, QaReportService], exports: [QaService, PoursService, QaRegistersService, QaAuditsService] })
export class QaModule {}
