import { Module } from '@nestjs/common';
import { DprModule } from '../dpr/dpr.module';
import { ProgressModule } from '../progress/progress.module';
import { MaterialRequestsModule } from '../material-requests/material-requests.module';
import { MachineryModule } from '../machinery/machinery.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { PayablesModule } from '../payables/payables.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { MaterialApprovalsModule } from '../material-approvals/material-approvals.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentTargetsService } from './comment-targets.service';

@Module({
  imports: [DprModule, ProgressModule, MaterialRequestsModule, MachineryModule, ExpensesModule, MeasurementsModule, RaBillsModule, PurchasingModule, SubcontractsModule, InspectionsModule, PayablesModule, MeetingsModule, MaterialApprovalsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentTargetsService],
})
export class CommentsModule {}
