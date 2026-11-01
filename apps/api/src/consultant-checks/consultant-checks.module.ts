import { Module } from '@nestjs/common';
import { ConsultantChecksController } from './consultant-checks.controller';
import { ConsultantChecksService } from './consultant-checks.service';
import { SiteOrdersService } from './site-orders.service';

@Module({ controllers: [ConsultantChecksController], providers: [ConsultantChecksService, SiteOrdersService], exports: [ConsultantChecksService, SiteOrdersService] })
export class ConsultantChecksModule {}
