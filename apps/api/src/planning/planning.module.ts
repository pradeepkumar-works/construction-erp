import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { WorkingCalendarService } from './working-calendar.service';

@Module({ controllers: [PlanningController, ScheduleController], providers: [PlanningService, ScheduleService, WorkingCalendarService], exports: [PlanningService, ScheduleService, WorkingCalendarService] })
export class PlanningModule {}
