import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({ imports: [VendorsModule], controllers: [StockController], providers: [StockService], exports: [StockService] })
export class StockModule {}
