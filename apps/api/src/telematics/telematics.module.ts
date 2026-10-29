import { Module } from '@nestjs/common';
import { TelematicsController } from './telematics.controller';
import { TelematicsService } from './telematics.service';

@Module({ controllers: [TelematicsController], providers: [TelematicsService], exports: [TelematicsService] })
export class TelematicsModule {}
