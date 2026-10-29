import { Module } from '@nestjs/common';
import { InspectionsModule } from '../inspections/inspections.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';
import { PoursService } from './pours.service';
import { QaRegistersController } from './registers.controller';
import { QaRegistersService } from './registers.service';

@Module({ imports: [InspectionsModule], controllers: [QaController, QaRegistersController], providers: [QaService, PoursService, QaRegistersService], exports: [QaService, PoursService, QaRegistersService] })
export class QaModule {}
