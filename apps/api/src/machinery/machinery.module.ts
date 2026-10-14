import { Module } from '@nestjs/common';
import { VendorsModule } from '../vendors/vendors.module';
import { MachineryController } from './machinery.controller';
import { MachineryService } from './machinery.service';

@Module({ imports: [VendorsModule], controllers: [MachineryController], providers: [MachineryService], exports: [MachineryService] })
export class MachineryModule {}
