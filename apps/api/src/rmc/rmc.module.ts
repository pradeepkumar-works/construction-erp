import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { QualityModule } from '../quality/quality.module';
import { RmcController } from './rmc.controller';
import { RmcService } from './rmc.service';

/** Ready-mix concrete (v6 item 104). */
@Module({ imports: [StockModule, QualityModule], controllers: [RmcController], providers: [RmcService], exports: [RmcService] })
export class RmcModule {}
