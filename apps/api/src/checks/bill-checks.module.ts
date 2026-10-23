import { Module } from '@nestjs/common';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { AiModule } from '../ai/ai.module';
import { AttendanceCheckModule } from '../attendance-check/attendance-check.module';
import { BillChecksController } from './bill-checks.controller';
import { BillChecksService } from './bill-checks.service';

/** Bill checks before approval (AI roadmap item 69). */
@Module({ imports: [PurchasingModule, SubcontractsModule, ExpensesModule, RaBillsModule, AiModule, AttendanceCheckModule], controllers: [BillChecksController], providers: [BillChecksService], exports: [BillChecksService] })
export class BillChecksModule {}
