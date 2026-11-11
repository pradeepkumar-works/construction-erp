import { Module } from '@nestjs/common';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { RmcModule } from '../rmc/rmc.module';
import { StockModule } from '../stock/stock.module';
import { GstController } from './gst.controller';
import { GstService } from './gst.service';
import { EinvoiceService } from './einvoice.service';

@Module({ imports: [RaBillsModule, RmcModule, StockModule], controllers: [GstController], providers: [GstService, EinvoiceService] })
export class GstModule {}
