import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { QualityModule } from '../quality/quality.module';
import { RmcController } from './rmc.controller';
import { RmcService } from './rmc.service';
import { PlantBatchesService } from './plant-batches.service';

/** Ready-mix concrete (v6 item 104), with the batching plant controller's reports (item 149). */
@Module({ imports: [StockModule, QualityModule], controllers: [RmcController], providers: [RmcService, PlantBatchesService], exports: [RmcService, PlantBatchesService] })
export class RmcModule {}
