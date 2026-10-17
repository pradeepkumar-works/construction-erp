import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({ controllers: [PlanningController, ScheduleController], providers: [PlanningService, ScheduleService], exports: [PlanningService, ScheduleService] })
export class PlanningModule {}
