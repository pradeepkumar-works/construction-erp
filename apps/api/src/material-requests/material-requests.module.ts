import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { MaterialRequestsController } from './material-requests.controller';
import { MaterialRequestsService } from './material-requests.service';

@Module({ imports: [StockModule], controllers: [MaterialRequestsController], providers: [MaterialRequestsService], exports: [MaterialRequestsService] })
export class MaterialRequestsModule {}
