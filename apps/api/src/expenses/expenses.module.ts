import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({ imports: [VendorsModule], controllers: [ExpensesController], providers: [ExpensesService], exports: [ExpensesService] })
export class ExpensesModule {}
