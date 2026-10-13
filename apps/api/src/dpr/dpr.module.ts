import { Module } from '@nestjs/common';
import { DprController } from './dpr.controller';
import { DprService } from './dpr.service';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({ imports: [AttendanceModule], controllers: [DprController], providers: [DprService], exports: [DprService] })
export class DprModule {}
