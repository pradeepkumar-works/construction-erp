import { Module } from '@nestjs/common';
import { TelematicsModule } from '../telematics/telematics.module';
import { WeighbridgeModule } from '../weighbridge/weighbridge.module';
import { RmcModule } from '../rmc/rmc.module';
import { ConnectorController, HooksController, IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsSchedulerService } from './integrations-scheduler.service';

@Module({
  imports: [TelematicsModule, WeighbridgeModule, RmcModule],
  controllers: [IntegrationsController, HooksController, ConnectorController],
  providers: [IntegrationsService, IntegrationsSchedulerService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
