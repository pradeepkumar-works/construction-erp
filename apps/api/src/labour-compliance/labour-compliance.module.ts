import { Module } from '@nestjs/common';
import { LabourComplianceController } from './labour-compliance.controller';
import { LabourComplianceService } from './labour-compliance.service';

@Module({ controllers: [LabourComplianceController], providers: [LabourComplianceService], exports: [LabourComplianceService] })
export class LabourComplianceModule {}
