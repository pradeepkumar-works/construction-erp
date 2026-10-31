import { Module } from '@nestjs/common';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { AiModule } from '../ai/ai.module';
import { AttendanceCheckModule } from '../attendance-check/attendance-check.module';
import { TelematicsModule } from '../telematics/telematics.module';
import { BillChecksController } from './bill-checks.controller';
import { BillChecksService } from './bill-checks.service';

/** Bill checks before approval. */
@Module({ imports: [PurchasingModule, SubcontractsModule, ExpensesModule, RaBillsModule, AiModule, AttendanceCheckModule, TelematicsModule], controllers: [BillChecksController], providers: [BillChecksService], exports: [BillChecksService] })
export class BillChecksModule {}
