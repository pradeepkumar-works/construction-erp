import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { LauncherController } from './launcher.controller';
import { LauncherService } from './launcher.service';
import { HomeTilesService } from './home-tiles.service';

@Module({ imports: [DashboardModule], controllers: [LauncherController], providers: [LauncherService, HomeTilesService] })
export class LauncherModule {}
