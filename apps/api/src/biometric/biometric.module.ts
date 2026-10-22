import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkersModule } from '../workers/workers.module';
import { BiometricController, IclockController } from './biometric.controller';
import { BiometricService } from './biometric.service';

@Module({ imports: [AttendanceModule, WorkersModule], controllers: [BiometricController, IclockController], providers: [BiometricService], exports: [BiometricService] })
export class BiometricModule {}
