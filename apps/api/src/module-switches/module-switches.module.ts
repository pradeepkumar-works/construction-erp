import { Module } from '@nestjs/common';
import { ModuleSwitchesController } from './module-switches.controller';
import { ModuleSwitchesService } from './module-switches.service';

/** Module switches; ModuleSwitchGuard (common) refuses a switched-off module's routes. */
@Module({ controllers: [ModuleSwitchesController], providers: [ModuleSwitchesService] })
export class ModuleSwitchesModule {}
