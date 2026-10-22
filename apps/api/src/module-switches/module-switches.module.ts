import { Module } from '@nestjs/common';
import { ModuleSwitchesController } from './module-switches.controller';
import { ModuleSwitchesService } from './module-switches.service';

/** Module switches (v6 item 117); ModuleSwitchGuard (common) refuses a switched-off module's routes. */
@Module({ controllers: [ModuleSwitchesController], providers: [ModuleSwitchesService] })
export class ModuleSwitchesModule {}
