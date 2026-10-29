import { Module } from '@nestjs/common';
import { DprController } from './dpr.controller';
import { DprService } from './dpr.service';
import { DprChecksService } from './dpr-checks.service';
import { AttendanceModule } from '../attendance/attendance.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({ imports: [AttendanceModule, TemplatesModule], controllers: [DprController], providers: [DprService, DprChecksService], exports: [DprService] })
export class DprModule {}
