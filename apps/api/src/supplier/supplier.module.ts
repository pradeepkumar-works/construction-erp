import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnquiriesModule } from '../enquiries/enquiries.module';
import { SupplierController, SupplierPortalController } from './supplier.controller';
import { SupplierService } from './supplier.service';

/** The supplier portal (v6 item 105). */
@Module({ imports: [AuthModule, EnquiriesModule], controllers: [SupplierController, SupplierPortalController], providers: [SupplierService] })
export class SupplierModule {}
