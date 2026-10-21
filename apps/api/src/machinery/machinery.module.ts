import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { MachineryController } from './machinery.controller';
import { MachineryService } from './machinery.service';
import { FleetService } from './fleet.service';

@Module({ imports: [VendorsModule], controllers: [MachineryController], providers: [MachineryService, FleetService], exports: [MachineryService, FleetService] })
export class MachineryModule {}
