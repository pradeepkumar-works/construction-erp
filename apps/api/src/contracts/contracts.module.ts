import { Module } from '@nestjs/common';
import { ContractsController, LdExposureController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [TemplatesModule], controllers: [ContractsController, LdExposureController], providers: [ContractsService], exports: [ContractsService] })
export class ContractsModule {}
