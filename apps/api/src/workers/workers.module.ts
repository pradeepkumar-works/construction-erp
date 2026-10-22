import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';

@Module({ imports: [AttendanceModule], controllers: [WorkersController], providers: [WorkersService], exports: [WorkersService] })
export class WorkersModule {}
