import { PayablesModule } from '../payables/payables.module';
import { Module } from '@nestjs/common';
import { RfisModule } from '../rfis/rfis.module';
import { MaterialRequestsModule } from '../material-requests/material-requests.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SubcontractsModule } from '../subcontracts/subcontracts.module';
import { RaBillsModule } from '../ra-bills/ra-bills.module';
import { MeasurementsModule } from '../measurements/measurements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { RisksModule } from '../risks/risks.module';
import { DocumentsModule } from '../documents/documents.module';
import { VendorsModule } from '../vendors/vendors.module';
import { ClientsModule } from '../clients/clients.module';
import { StockModule } from '../stock/stock.module';
import { StaffModule } from '../staff/staff.module';
import { TendersModule } from '../tenders/tenders.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [MaterialRequestsModule, PurchasingModule, SubcontractsModule, RaBillsModule, MeasurementsModule, ExpensesModule, InspectionsModule, RisksModule, DocumentsModule, RfisModule, VendorsModule, ClientsModule, StockModule, StaffModule, PayablesModule, TendersModule, MeetingsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
