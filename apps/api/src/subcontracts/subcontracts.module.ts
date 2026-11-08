import { Module } from '@nestjs/common';
import { SubcontractsController } from './subcontracts.controller';
import { WorkOrdersService } from './work-orders.service';
import { SubcontractBillsService } from './subcontract-bills.service';
import { WorkOrderAmendmentsService } from './work-order-amendments.service';
import { ScEnquiriesController } from './sc-enquiries.controller';
import { ScEnquiriesService } from './sc-enquiries.service';

@Module({
  controllers: [SubcontractsController, ScEnquiriesController],
  providers: [WorkOrdersService, SubcontractBillsService, ScEnquiriesService, WorkOrderAmendmentsService],
  exports: [WorkOrdersService, SubcontractBillsService, ScEnquiriesService, WorkOrderAmendmentsService],
})
export class SubcontractsModule {}
