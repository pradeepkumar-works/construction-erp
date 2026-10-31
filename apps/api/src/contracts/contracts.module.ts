import { Module } from '@nestjs/common';
import { ContractsController, LdExposureController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractObligationsController } from './contract-obligations.controller';
import { ContractObligationsService } from './contract-obligations.service';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [TemplatesModule], controllers: [ContractsController, LdExposureController, ContractObligationsController], providers: [ContractsService, ContractObligationsService], exports: [ContractsService, ContractObligationsService] })
export class ContractsModule {}
