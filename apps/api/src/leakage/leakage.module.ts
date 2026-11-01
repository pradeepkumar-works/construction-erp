import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { LeakageController } from './leakage.controller';
import { LeakageService } from './leakage.service';

/** Leakage checks. The watch list builds its RATE_ABOVE, FUEL_NO_LOG and IDLE_HIRE warnings from it. */
@Module({ imports: [ReconciliationModule, PurchasingModule], controllers: [LeakageController], providers: [LeakageService], exports: [LeakageService] })
export class LeakageModule {}
