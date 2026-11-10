import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { TdsController } from './tds.controller';
import { TdsDeductionsService } from './tds-deductions.service';
import { TdsService } from './tds.service';

/** TDS by section: the deductions the payables, subcontract bills and payroll write, challans and the quarterly returns. */
@Module({ imports: [BooksModule], controllers: [TdsController], providers: [TdsDeductionsService, TdsService], exports: [TdsDeductionsService, TdsService] })
export class TdsModule {}
