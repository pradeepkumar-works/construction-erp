import { Module } from '@nestjs/common';
import { ContractsController, LdExposureController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({ controllers: [ContractsController, LdExposureController], providers: [ContractsService], exports: [ContractsService] })
export class ContractsModule {}
