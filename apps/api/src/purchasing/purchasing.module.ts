import { Module } from '@nestjs/common';
import { PurchasingController } from './purchasing.controller';
import { QuotationsService } from './quotations.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import { VendorBillsService } from './vendor-bills.service';
import { RequestsToOrderService } from './requests-to-order.service';

@Module({ controllers: [PurchasingController], providers: [QuotationsService, PurchaseOrdersService, VendorBillsService, RequestsToOrderService], exports: [PurchaseOrdersService, VendorBillsService, RequestsToOrderService] })
export class PurchasingModule {}
