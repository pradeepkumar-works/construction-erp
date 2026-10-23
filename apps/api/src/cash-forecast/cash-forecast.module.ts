import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { PayablesModule } from '../payables/payables.module';
import { DocumentsModule } from '../documents/documents.module';
import { CashForecastController } from './cash-forecast.controller';
import { CashForecastService } from './cash-forecast.service';

/** The 13-week cash forecast and billing readiness (AI item 122). The watch list's CASH warning reads the forecast. */
@Module({ imports: [BooksModule, ReceivablesModule, PayablesModule, DocumentsModule], controllers: [CashForecastController], providers: [CashForecastService], exports: [CashForecastService] })
export class CashForecastModule {}
