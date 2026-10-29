import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { TelematicsController } from './telematics.controller';
import { TelematicsService } from './telematics.service';
import { FuelDispenseService } from './fuel-dispense.service';

@Module({ imports: [StockModule], controllers: [TelematicsController], providers: [TelematicsService, FuelDispenseService], exports: [TelematicsService, FuelDispenseService] })
export class TelematicsModule {}
