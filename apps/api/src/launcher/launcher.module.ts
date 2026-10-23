import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { LauncherController } from './launcher.controller';
import { LauncherService } from './launcher.service';

@Module({ imports: [DashboardModule], controllers: [LauncherController], providers: [LauncherService] })
export class LauncherModule {}
