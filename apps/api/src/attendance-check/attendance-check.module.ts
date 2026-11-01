import { Module } from '@nestjs/common';
import { AttendanceCheckController } from './attendance-check.controller';
import { AttendanceCheckService } from './attendance-check.service';

/** Attendance cross-check. Bill checks and the watch list's MANDAYS_ABOVE read it. */
@Module({ controllers: [AttendanceCheckController], providers: [AttendanceCheckService], exports: [AttendanceCheckService] })
export class AttendanceCheckModule {}
