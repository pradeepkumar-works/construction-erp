import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [StockModule], controllers: [MaintenanceController], providers: [MaintenanceService] })
export class MaintenanceModule {}
