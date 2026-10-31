import { Module } from '@nestjs/common';
import { DprModule } from '../dpr/dpr.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { ReportsModule } from '../reports/reports.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { RfisModule } from '../rfis/rfis.module';
import { ConsultantChecksModule } from '../consultant-checks/consultant-checks.module';
import { ProgrammeModule } from '../programme/programme.module';

@Module({ imports: [DprModule, RaBillsModule, InspectionsModule, ReportsModule, RfisModule, ConsultantChecksModule, ProgrammeModule], controllers: [PortalController], providers: [PortalService] })
export class PortalModule {}
