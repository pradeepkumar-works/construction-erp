import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkersModule } from '../workers/workers.module';
import { BiometricController, IclockController } from './biometric.controller';
import { BiometricService } from './biometric.service';
import { BiometricCommandsService } from './biometric-commands.service';

@Module({ imports: [AttendanceModule, WorkersModule], controllers: [BiometricController, IclockController], providers: [BiometricService, BiometricCommandsService], exports: [BiometricService] })
export class BiometricModule {}
