import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { TelematicsModule } from '../telematics/telematics.module';
import { MachineryController } from './machinery.controller';
import { MachineryService } from './machinery.service';
import { FleetService } from './fleet.service';

@Module({ imports: [VendorsModule, TelematicsModule], controllers: [MachineryController], providers: [MachineryService, FleetService], exports: [MachineryService, FleetService] })
export class MachineryModule {}
