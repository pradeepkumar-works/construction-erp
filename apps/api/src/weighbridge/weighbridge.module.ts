import { Module } from '@nestjs/common';
import { WeighbridgeController } from './weighbridge.controller';
import { WeighbridgeService } from './weighbridge.service';

@Module({ controllers: [WeighbridgeController], providers: [WeighbridgeService], exports: [WeighbridgeService] })
export class WeighbridgeModule {}
