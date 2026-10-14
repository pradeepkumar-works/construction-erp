import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller';
import { QuotationsService } from './quotations.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { VendorBillsService } from './vendor-bills.service';

@Module({ controllers: [PurchasingController], providers: [QuotationsService, PurchaseOrdersService, VendorBillsService] })
export class PurchasingModule {}
