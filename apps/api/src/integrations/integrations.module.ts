import { Module } from '@nestjs/common';
import { ConnectorController, HooksController, IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({ controllers: [IntegrationsController, HooksController, ConnectorController], providers: [IntegrationsService], exports: [IntegrationsService] })
export class IntegrationsModule {}
