import { Module } from '@nestjs/common';
import { SubcontractsController } from './subcontracts.controller';
import { WorkOrdersService } from './work-orders.service';
import { SubcontractBillsService } from './subcontract-bills.service';

@Module({ controllers: [SubcontractsController], providers: [WorkOrdersService, SubcontractBillsService] })
export class SubcontractsModule {}
